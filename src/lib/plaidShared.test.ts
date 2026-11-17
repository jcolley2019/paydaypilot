// PP.9.1 — the pure Plaid modules shared with the Edge Functions (supabase/functions/_shared).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bytesToBase64, decryptToken, encryptToken } from '../../supabase/functions/_shared/tokenCrypto.ts'
import {
  collapseSyncUpdates,
  mapAccount,
  mapTransaction,
  type PlaidAccount,
  type PlaidTransaction,
} from '../../supabase/functions/_shared/plaidMapping.ts'
import { fetchSyncUpdates, plaidConfigFrom, type PlaidConfig } from '../../supabase/functions/_shared/plaidApi.ts'

function randomKey(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))
}

const NOW = '2026-11-16T12:00:00.000Z'
const USER = 'user-1'

function tx(overrides: Partial<PlaidTransaction> = {}): PlaidTransaction {
  return {
    transaction_id: 'tx-1',
    account_id: 'plaid-acc-1',
    amount: 42.5,
    date: '2026-11-10',
    authorized_date: '2026-11-09',
    name: 'NETFLIX.COM 866-579',
    merchant_name: 'Netflix',
    pending: false,
    pending_transaction_id: null,
    personal_finance_category: { primary: 'ENTERTAINMENT', detailed: 'ENTERTAINMENT_TV_AND_MOVIES' },
    ...overrides,
  }
}

describe('token encryption', () => {
  it('round-trips and uses a fresh IV each time', async () => {
    const key = randomKey()
    const token = 'access-sandbox-1234abcd-5678-efgh'
    const a = await encryptToken(token, key)
    const b = await encryptToken(token, key)
    expect(a).toMatch(/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/)
    expect(a).not.toContain(token)
    expect(a).not.toBe(b)
    expect(await decryptToken(a, key)).toBe(token)
    expect(await decryptToken(b, key)).toBe(token)
  })

  it('fails with the wrong key', async () => {
    const stored = await encryptToken('access-sandbox-secret', randomKey())
    await expect(decryptToken(stored, randomKey())).rejects.toThrow(/wrong key/)
  })

  it('fails on a tampered value or a bad format', async () => {
    const key = randomKey()
    const [v, iv, ct] = (await encryptToken('access-sandbox-secret', key)).split('.')
    const flipped = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1)
    await expect(decryptToken(`${v}.${iv}.${flipped}`, key)).rejects.toThrow()
    await expect(decryptToken('plain-token', key)).rejects.toThrow(/format/)
  })

  it('rejects a key that is not 32 bytes', async () => {
    const shortKey = bytesToBase64(new Uint8Array(16))
    await expect(encryptToken('x', shortKey)).rejects.toThrow(/32 bytes/)
  })
})

describe('mapTransaction', () => {
  it('keeps the Plaid sign: positive is money out, negative is money in', () => {
    const spend = mapTransaction(tx({ amount: 42.5 }), USER, 'acc-1', NOW)
    const paycheck = mapTransaction(tx({ transaction_id: 'tx-2', amount: -1850, name: 'ACME PAYROLL' }), USER, 'acc-1', NOW)
    expect(spend?.amount).toBe(42.5)
    expect(paycheck?.amount).toBe(-1850)
  })

  it('maps a posted transaction to a full row', () => {
    expect(mapTransaction(tx(), USER, 'acc-1', NOW)).toEqual({
      user_id: USER,
      account_id: 'acc-1',
      source: 'plaid',
      plaid_transaction_id: 'tx-1',
      pending_transaction_id: null,
      amount: 42.5,
      date: '2026-11-10',
      authorized_date: '2026-11-09',
      name: 'NETFLIX.COM 866-579',
      merchant: 'Netflix',
      category: 'ENTERTAINMENT',
      category_detail: 'ENTERTAINMENT_TV_AND_MOVIES',
      pending: false,
      updated_at: NOW,
    })
  })

  it('maps a pending row and a posted row that points back at it', () => {
    const pending = mapTransaction(tx({ transaction_id: 'tx-p', pending: true, authorized_date: null }), USER, 'acc-1', NOW)
    expect(pending?.pending).toBe(true)
    expect(pending?.authorized_date).toBeNull()
    const posted = mapTransaction(tx({ transaction_id: 'tx-posted', pending_transaction_id: 'tx-p' }), USER, 'acc-1', NOW)
    expect(posted?.pending).toBe(false)
    expect(posted?.pending_transaction_id).toBe('tx-p')
  })

  it('never writes matched_bill_instance_id', () => {
    expect(mapTransaction(tx(), USER, 'acc-1', NOW)).not.toHaveProperty('matched_bill_instance_id')
  })

  it('falls back for missing names and categories, and rejects unusable rows', () => {
    const row = mapTransaction(tx({ name: null, merchant_name: '  ', personal_finance_category: null }), USER, 'acc-1', NOW)
    expect(row?.name).toBe('Transaction')
    expect(row?.merchant).toBeNull()
    expect(row?.category).toBeNull()
    expect(mapTransaction(tx({ amount: Number.NaN }), USER, 'acc-1', NOW)).toBeNull()
    expect(mapTransaction(tx({ date: '' }), USER, 'acc-1', NOW)).toBeNull()
  })
})

describe('mapAccount', () => {
  const account: PlaidAccount = {
    account_id: 'plaid-acc-1',
    name: 'Plaid Checking',
    official_name: 'Plaid Gold Standard 0% Interest Checking',
    mask: '0000',
    type: 'depository',
    subtype: 'checking',
    balances: { current: 110, available: 100 },
  }

  it('maps balances and links the row to our plaid item', () => {
    expect(mapAccount(account, USER, 'item-uuid', NOW)).toEqual({
      user_id: USER,
      name: 'Plaid Checking',
      mask: '0000',
      type: 'depository',
      subtype: 'checking',
      source: 'plaid',
      plaid_item_id: 'item-uuid',
      plaid_account_id: 'plaid-acc-1',
      balance: 110,
      available_balance: 100,
      balance_updated_at: NOW,
    })
  })

  it('never writes accounts.active, and keeps null balances null', () => {
    const row = mapAccount({ ...account, type: 'credit', subtype: 'credit card', balances: { current: 410, available: null } }, USER, 'item-uuid', NOW)
    expect(row).not.toHaveProperty('active')
    expect(row.balance).toBe(410)
    expect(row.available_balance).toBeNull()
  })
})

describe('collapseSyncUpdates', () => {
  it('keeps the latest version of each transaction and drops removed ones', () => {
    const { upserts, removedIds } = collapseSyncUpdates(
      [tx({ transaction_id: 'a', amount: 1 }), tx({ transaction_id: 'b' }), tx({ transaction_id: 'c' })],
      [tx({ transaction_id: 'a', amount: 2 })],
      [{ transaction_id: 'c' }, { transaction_id: 'c' }, { transaction_id: 'gone' }],
    )
    expect(upserts.map((t) => [t.transaction_id, t.amount])).toEqual([
      ['a', 2],
      ['b', 42.5],
    ])
    expect(removedIds).toEqual(['c', 'gone'])
  })
})

describe('plaidConfigFrom', () => {
  it('picks the secret that matches PLAID_ENV', () => {
    const env: Record<string, string> = { PLAID_ENV: 'sandbox', PLAID_CLIENT_ID: 'cid', PLAID_SECRET_SANDBOX: 's' }
    expect(plaidConfigFrom((n) => env[n])).toEqual({ env: 'sandbox', baseUrl: 'https://sandbox.plaid.com', clientId: 'cid', secret: 's' })
    expect(plaidConfigFrom((n) => ({ ...env, PLAID_ENV: 'production' })[n])).toBe('PLAID_SECRET_PRODUCTION not set')
    expect(plaidConfigFrom((n) => ({ ...env, PLAID_ENV: 'development' })[n])).toMatch(/PLAID_ENV/)
    expect(plaidConfigFrom((n) => ({ ...env, PLAID_CLIENT_ID: '' })[n])).toBe('PLAID_CLIENT_ID not set')
  })
})

describe('fetchSyncUpdates', () => {
  const config: PlaidConfig = { env: 'sandbox', baseUrl: 'https://sandbox.plaid.com', clientId: 'cid', secret: 's' }

  function page(body: Record<string, unknown>): Response {
    return new Response(JSON.stringify({ added: [], modified: [], removed: [], accounts: [], ...body }), { status: 200 })
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('restarts from the original cursor after a mutation during pagination', async () => {
    const cursors: (string | undefined)[] = []
    const responses = [
      page({ added: [tx({ transaction_id: 'a' })], next_cursor: 'c1', has_more: true }),
      new Response(JSON.stringify({ error_type: 'TRANSACTIONS_ERROR', error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION', error_message: 'changed' }), { status: 400 }),
      page({ added: [tx({ transaction_id: 'a' })], next_cursor: 'c1', has_more: true }),
      page({ added: [tx({ transaction_id: 'b' })], next_cursor: 'c2', has_more: false }),
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        cursors.push((JSON.parse(String(init.body)) as { cursor?: string }).cursor)
        return responses.shift()!
      }),
    )
    const updates = await fetchSyncUpdates(config, 'access-token', 'c0')
    expect(cursors).toEqual(['c0', 'c1', 'c0', 'c1'])
    expect(updates.added.map((t) => t.transaction_id)).toEqual(['a', 'b'])
    expect(updates.nextCursor).toBe('c2')
  })

  it('returns a null cursor while Plaid has no data yet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => page({ next_cursor: '', has_more: false, transactions_update_status: 'NOT_READY' })))
    const updates = await fetchSyncUpdates(config, 'access-token', null)
    expect(updates.nextCursor).toBeNull()
    expect(updates.updateStatus).toBe('NOT_READY')
  })
})
