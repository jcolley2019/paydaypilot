// PP.9.1 — sync one Plaid item into accounts + transactions (Deno; service-role client).
// Every query is scoped by the verified user id. The access token is decrypted here and
// passed only to Plaid; it is never returned or logged.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { fetchSyncUpdates, plaidErrorCode, plaidRequest, type PlaidConfig } from './plaidApi.ts'
import { collapseSyncUpdates, mapAccount, mapTransaction, type PlaidAccount, type TransactionRow } from './plaidMapping.ts'
import { decryptToken } from './tokenCrypto.ts'

export interface ItemRef {
  id: string
  institution_name: string | null
}

export interface ItemSyncResult {
  id: string
  institution_name: string | null
  status: 'active' | 'login_required' | 'error'
  accounts: number
  transactions_upserted: number
  transactions_removed: number
  error_code?: string
}

const WRITE_CHUNK = 500

function chunks<T>(items: T[], size = WRITE_CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function dbError(step: string, error: { message: string }): Error {
  return new Error(`${step}: ${error.message}`)
}

/** Reads and decrypts the item's token + cursor (plaid_item_secrets is service-role only). */
export async function loadItemSecret(
  admin: SupabaseClient,
  plaidItemId: string,
  tokenKey: string,
): Promise<{ accessToken: string; cursor: string | null }> {
  const { data, error } = await admin
    .from('plaid_item_secrets')
    .select('access_token_encrypted, transactions_cursor')
    .eq('plaid_item_id', plaidItemId)
    .maybeSingle()
  if (error) throw dbError('read item secret', error)
  if (!data) throw new Error('item has no stored token')
  return {
    accessToken: await decryptToken(data.access_token_encrypted as string, tokenKey),
    cursor: (data.transactions_cursor as string | null) ?? null,
  }
}

/**
 * The item must already be verified as the caller's. Accounts come from /accounts/get (the
 * sync response only lists accounts that have transactions), then every /transactions/sync
 * page is applied, and only after that is the new cursor stored.
 */
async function applySync(
  admin: SupabaseClient,
  plaid: PlaidConfig,
  userId: string,
  item: ItemRef,
  tokenKey: string,
): Promise<Omit<ItemSyncResult, 'id' | 'institution_name' | 'status'>> {
  const { accessToken, cursor } = await loadItemSecret(admin, item.id, tokenKey)
  const now = new Date().toISOString()

  const { accounts } = await plaidRequest<{ accounts: PlaidAccount[] }>(plaid, '/accounts/get', { access_token: accessToken })
  const accountIdByPlaid = new Map<string, string>()
  if (accounts.length > 0) {
    const { data, error } = await admin
      .from('accounts')
      .upsert(
        accounts.map((account) => mapAccount(account, userId, item.id, now)),
        { onConflict: 'plaid_account_id' },
      )
      .select('id, plaid_account_id')
    if (error) throw dbError('upsert accounts', error)
    for (const row of data ?? []) accountIdByPlaid.set(row.plaid_account_id as string, row.id as string)
  }

  const updates = await fetchSyncUpdates(plaid, accessToken, cursor)
  const { upserts, removedIds } = collapseSyncUpdates(updates.added, updates.modified, updates.removed)

  // A transaction on an account /accounts/get did not list: look it up among this user's rows.
  const unknown = [...new Set(upserts.map((tx) => tx.account_id).filter((id) => !accountIdByPlaid.has(id)))]
  if (unknown.length > 0) {
    const { data, error } = await admin
      .from('accounts')
      .select('id, plaid_account_id')
      .eq('user_id', userId)
      .in('plaid_account_id', unknown)
    if (error) throw dbError('look up accounts', error)
    for (const row of data ?? []) accountIdByPlaid.set(row.plaid_account_id as string, row.id as string)
  }

  const rows: TransactionRow[] = []
  for (const tx of upserts) {
    const accountId = accountIdByPlaid.get(tx.account_id)
    const row = accountId ? mapTransaction(tx, userId, accountId, now) : null
    if (row) rows.push(row)
  }
  for (const batch of chunks(rows)) {
    const { error } = await admin.from('transactions').upsert(batch, { onConflict: 'plaid_transaction_id' })
    if (error) throw dbError('upsert transactions', error)
  }
  for (const batch of chunks(removedIds)) {
    const { error } = await admin.from('transactions').delete().eq('user_id', userId).in('plaid_transaction_id', batch)
    if (error) throw dbError('delete removed transactions', error)
  }

  // Every page is applied — only now does the cursor move.
  if (updates.nextCursor !== cursor) {
    const { error } = await admin
      .from('plaid_item_secrets')
      .update({ transactions_cursor: updates.nextCursor, updated_at: now })
      .eq('plaid_item_id', item.id)
    if (error) throw dbError('save cursor', error)
  }

  return { accounts: accounts.length, transactions_upserted: rows.length, transactions_removed: removedIds.length }
}

/**
 * Syncs one item and records the outcome on plaid_items. ITEM_LOGIN_REQUIRED marks the item
 * 'login_required'; any other failure is reported (and its code stored) without changing the
 * status, so a transient Plaid error does not stop future syncs. Never throws.
 */
export async function syncItem(
  admin: SupabaseClient,
  plaid: PlaidConfig,
  userId: string,
  item: ItemRef,
  tokenKey: string,
): Promise<ItemSyncResult> {
  const base = { id: item.id, institution_name: item.institution_name }
  try {
    const counts = await applySync(admin, plaid, userId, item, tokenKey)
    const now = new Date().toISOString()
    await admin
      .from('plaid_items')
      .update({ status: 'active', error_code: null, last_synced_at: now, updated_at: now })
      .eq('id', item.id)
      .eq('user_id', userId)
    return { ...base, status: 'active', ...counts }
  } catch (err) {
    const code = plaidErrorCode(err) ?? 'SYNC_FAILED'
    const loginRequired = code === 'ITEM_LOGIN_REQUIRED'
    console.error(`plaid sync item ${item.id} failed: ${err instanceof Error ? err.message : String(err)}`)
    await admin
      .from('plaid_items')
      .update({
        ...(loginRequired ? { status: 'login_required' } : {}),
        error_code: code,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
      .eq('user_id', userId)
    return {
      ...base,
      status: loginRequired ? 'login_required' : 'error',
      accounts: 0,
      transactions_upserted: 0,
      transactions_removed: 0,
      error_code: code,
    }
  }
}
