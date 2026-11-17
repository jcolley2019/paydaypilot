// PP.9.1 — local Plaid Sandbox smoke test for the shared server code.
// Run: node scripts/plaid-smoke.ts   (Node 22.6+ strips the types itself)
// Reads supabase/functions/.env. Prints counts only — never keys, secrets or tokens.
// Flow: /sandbox/public_token/create (ins_109508, transactions) -> exchange -> /accounts/get
// -> full /transactions/sync loop through the shared mapping (retrying while the sandbox's
// first pull is still empty) -> encrypt/decrypt the access token -> /item/remove.
// PP.9.3 — also /link/token/create WITH PLAID_REDIRECT_URI, new and update mode, using the
// Edge Function's own request builder. Fails if the URI is not in the Dashboard allowlist.
import { readFileSync } from 'node:fs'
import { fetchSyncUpdates, plaidConfigFrom, plaidRequest, type PlaidConfig } from '../supabase/functions/_shared/plaidApi.ts'
import { collapseSyncUpdates, mapAccount, mapTransaction, type PlaidAccount } from '../supabase/functions/_shared/plaidMapping.ts'
import { decryptToken, encryptToken } from '../supabase/functions/_shared/tokenCrypto.ts'
import { buildLinkTokenRequest, linkTokenRedirectUri } from '../supabase/functions/_shared/linkToken.ts'

const ENV_PATH = new URL('../supabase/functions/.env', import.meta.url)
const RETRY_FOR_MS = 30_000
const RETRY_EVERY_MS = 3_000

function readEnvFile(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return env
}

function step(label: string, detail = ''): void {
  console.log(`  ok  ${label}${detail ? ` - ${detail}` : ''}`)
}

async function main(): Promise<void> {
  const env = readEnvFile()
  const config = plaidConfigFrom((name) => env[name])
  if (typeof config === 'string') throw new Error(config)
  if (config.env !== 'sandbox') throw new Error('Smoke test runs against PLAID_ENV=sandbox only')
  const tokenKey = env.PLAID_TOKEN_KEY
  if (!tokenKey) throw new Error('PLAID_TOKEN_KEY not set')
  const plaid: PlaidConfig = config
  const configuredRedirect = env.PLAID_REDIRECT_URI
  if (!configuredRedirect) throw new Error('PLAID_REDIRECT_URI not set')
  // Same rule the function applies to the deployed app's Origin header.
  const redirectUri = linkTokenRedirectUri(new URL(configuredRedirect).origin, configuredRedirect)
  if (!redirectUri) throw new Error('PLAID_REDIRECT_URI is not a valid URL')

  await plaidRequest<{ link_token: string }>(
    plaid,
    '/link/token/create',
    buildLinkTokenRequest({ userId: 'smoke-user', redirectUri }),
  )
  step('link token created with redirect_uri', 'new connection')

  const { public_token } = await plaidRequest<{ public_token: string }>(plaid, '/sandbox/public_token/create', {
    institution_id: 'ins_109508',
    initial_products: ['transactions'],
    options: { transactions: { days_requested: 180 } },
  })
  step('sandbox public token created')

  const { access_token: accessToken } = await plaidRequest<{ access_token: string; item_id: string }>(
    plaid,
    '/item/public_token/exchange',
    { public_token },
  )
  step('public token exchanged')

  try {
    const { item } = await plaidRequest<{ item: { institution_id?: string | null } }>(plaid, '/item/get', {
      access_token: accessToken,
    })
    step('item looked up', `institution ${item.institution_id ?? 'none'}`)

    await plaidRequest<{ link_token: string }>(
      plaid,
      '/link/token/create',
      buildLinkTokenRequest({ userId: 'smoke-user', accessToken, redirectUri }),
    )
    step('link token created with redirect_uri', 'update mode')

    const now = new Date().toISOString()
    const { accounts } = await plaidRequest<{ accounts: PlaidAccount[] }>(plaid, '/accounts/get', { access_token: accessToken })
    const accountRows = accounts.map((account) => mapAccount(account, 'smoke-user', 'smoke-item', now))
    const accountIdByPlaid = new Map(accountRows.map((row, i) => [row.plaid_account_id, `smoke-account-${i}`]))
    step('accounts mapped', `${accountRows.length} accounts, ${accountRows.filter((r) => r.balance !== null).length} with a balance`)

    const started = Date.now()
    let attempts = 0
    let updates = await fetchSyncUpdates(plaid, accessToken, null)
    attempts++
    while (updates.added.length === 0 && Date.now() - started < RETRY_FOR_MS) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_EVERY_MS))
      updates = await fetchSyncUpdates(plaid, accessToken, null)
      attempts++
    }
    const { upserts, removedIds } = collapseSyncUpdates(updates.added, updates.modified, updates.removed)
    const rows = upserts
      .map((tx) => {
        const accountId = accountIdByPlaid.get(tx.account_id)
        return accountId ? mapTransaction(tx, 'smoke-user', accountId, now) : null
      })
      .filter((row) => row !== null)
    step(
      'transactions synced + mapped',
      `${rows.length} rows (${rows.filter((r) => r.pending).length} pending, ${rows.filter((r) => r.amount < 0).length} money-in), ` +
        `${removedIds.length} removed, ${updates.pages} page(s), ${attempts} attempt(s), status ${updates.updateStatus ?? 'n/a'}, ` +
        `cursor ${updates.nextCursor ? 'saved' : 'empty'}`,
    )

    const encrypted = await encryptToken(accessToken, tokenKey)
    const roundTrip = (await decryptToken(encrypted, tokenKey)) === accessToken
    if (!roundTrip) throw new Error('token encrypt/decrypt round-trip mismatch')
    step('access token encrypt/decrypt round-trip')

    const pass = accountRows.length > 0 && rows.length > 0
    console.log(`\nRESULT ${pass ? 'PASS' : 'FAIL'}: accounts=${accountRows.length} transactions=${rows.length}`)
    if (!pass) process.exitCode = 1
  } finally {
    await plaidRequest(plaid, '/item/remove', { access_token: accessToken })
    step('sandbox item removed')
  }
}

main().catch((err: unknown) => {
  // Error text comes from Plaid's error body or this script — never a token or key.
  console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
