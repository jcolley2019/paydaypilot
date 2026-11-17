// PP.9.1 — minimal Plaid API client: config, request helper, /transactions/sync loop.
// fetch only (no Deno or npm imports) so the Edge Functions and a local Node script share it.
// Credentials travel in the PLAID-CLIENT-ID / PLAID-SECRET headers and are never put into
// an error message or a log line.

import type { PlaidAccount, PlaidRemovedTransaction, PlaidTransaction } from './plaidMapping.ts'

export interface PlaidConfig {
  env: 'sandbox' | 'production'
  baseUrl: string
  clientId: string
  secret: string
}

/** Reads PLAID_ENV, PLAID_CLIENT_ID and PLAID_SECRET_<ENV>; returns an error string if any is missing. */
export function plaidConfigFrom(get: (name: string) => string | undefined): PlaidConfig | string {
  const env = (get('PLAID_ENV') ?? '').trim()
  if (env !== 'sandbox' && env !== 'production') return "PLAID_ENV must be 'sandbox' or 'production'"
  const clientId = (get('PLAID_CLIENT_ID') ?? '').trim()
  if (!clientId) return 'PLAID_CLIENT_ID not set'
  const secretName = env === 'sandbox' ? 'PLAID_SECRET_SANDBOX' : 'PLAID_SECRET_PRODUCTION'
  const secret = (get(secretName) ?? '').trim()
  if (!secret) return `${secretName} not set`
  return { env, baseUrl: `https://${env}.plaid.com`, clientId, secret }
}

export class PlaidApiError extends Error {
  status: number
  errorType: string | null
  errorCode: string | null
  requestId: string | null

  constructor(status: number, errorType: string | null, errorCode: string | null, message: string, requestId: string | null) {
    super(message)
    this.name = 'PlaidApiError'
    this.status = status
    this.errorType = errorType
    this.errorCode = errorCode
    this.requestId = requestId
  }
}

const REQUEST_TIMEOUT_MS = 30_000

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

export async function plaidRequest<T>(config: PlaidConfig, path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PLAID-CLIENT-ID': config.clientId,
      'PLAID-SECRET': config.secret,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(text) as Record<string, unknown>
  } catch {
    // Non-JSON body — handled below.
  }
  if (!res.ok) {
    const code = str(data.error_code)
    const message = str(data.error_message) ?? `HTTP ${res.status}`
    throw new PlaidApiError(res.status, str(data.error_type), code, `Plaid ${path} ${code ?? res.status}: ${message}`, str(data.request_id))
  }
  return data as T
}

export function plaidErrorCode(err: unknown): string | null {
  return err instanceof PlaidApiError ? err.errorCode : null
}

interface SyncPage {
  added: PlaidTransaction[]
  modified: PlaidTransaction[]
  removed: PlaidRemovedTransaction[]
  accounts: PlaidAccount[]
  next_cursor: string
  has_more: boolean
  transactions_update_status?: string
}

export interface SyncUpdates {
  added: PlaidTransaction[]
  modified: PlaidTransaction[]
  removed: PlaidRemovedTransaction[]
  /** Only accounts with transactions in this update (Plaid's rule) — use /accounts/get for all. */
  accounts: PlaidAccount[]
  /** null when Plaid has no data yet (it returns an empty cursor); the next sync starts over. */
  nextCursor: string | null
  updateStatus: string | null
  pages: number
}

const PAGE_SIZE = 500
const MAX_PAGINATION_RESTARTS = 3
const MAX_PAGES = 200

/**
 * Pages /transactions/sync from `cursor` until has_more is false. On
 * TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION the whole loop restarts from the original
 * cursor, as Plaid requires. Nothing is written here: the caller applies every page and only
 * then stores nextCursor.
 */
export async function fetchSyncUpdates(config: PlaidConfig, accessToken: string, cursor: string | null): Promise<SyncUpdates> {
  for (let attempt = 0; ; attempt++) {
    const updates: SyncUpdates = { added: [], modified: [], removed: [], accounts: [], nextCursor: null, updateStatus: null, pages: 0 }
    let pageCursor = cursor
    try {
      let hasMore = true
      while (hasMore) {
        if (updates.pages >= MAX_PAGES) throw new Error(`Plaid sync did not finish after ${MAX_PAGES} pages`)
        const page = await plaidRequest<SyncPage>(config, '/transactions/sync', {
          access_token: accessToken,
          ...(pageCursor ? { cursor: pageCursor } : {}),
          count: PAGE_SIZE,
        })
        updates.pages++
        updates.added.push(...(page.added ?? []))
        updates.modified.push(...(page.modified ?? []))
        updates.removed.push(...(page.removed ?? []))
        const seen = new Set(updates.accounts.map((account) => account.account_id))
        updates.accounts.push(...(page.accounts ?? []).filter((account) => !seen.has(account.account_id)))
        updates.updateStatus = page.transactions_update_status ?? null
        pageCursor = page.next_cursor || pageCursor
        hasMore = page.has_more === true
      }
      updates.nextCursor = pageCursor
      return updates
    } catch (err) {
      if (plaidErrorCode(err) === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' && attempt < MAX_PAGINATION_RESTARTS) continue
      throw err
    }
  }
}
