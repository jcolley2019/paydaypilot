// PP.9.2 — calls to the Plaid Edge Functions, plus the one-at-a-time lock every sync goes
// through (manual, auto, reconnect, and the exchange, which runs the first sync).
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { isAutoSyncDue } from '@/lib/plaidConnect'
import type { PlaidExchangeResponse, PlaidItem, PlaidSyncResponse } from '@/types/plaid'

/** A failed Plaid function call. status is null when no HTTP answer came back. */
export class PlaidCallError extends Error {
  readonly status: number | null
  readonly code: string | null

  constructor(message: string, status: number | null, code: string | null) {
    super(message)
    this.name = 'PlaidCallError'
    this.status = status
    this.code = code
  }
}

async function toPlaidError(error: unknown): Promise<PlaidCallError> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response
    let code: string | null = null
    try {
      const body = (await response.json()) as { error?: unknown } | null
      if (typeof body?.error === 'string') code = body.error
    } catch {
      // Not JSON — keep the status only.
    }
    return new PlaidCallError(error.message, response.status, code)
  }
  return new PlaidCallError(error instanceof Error ? error.message : 'Plaid call failed', null, null)
}

async function invokePlaid<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (error) throw await toPlaidError(error)
  if (!data) throw new PlaidCallError(`${name} returned no data`, null, null)
  return data
}

export async function createLinkToken(itemId?: string): Promise<string> {
  const data = await invokePlaid<{ link_token?: unknown }>('plaid-link-token', itemId ? { item_id: itemId } : {})
  if (typeof data.link_token !== 'string' || !data.link_token) {
    throw new PlaidCallError('plaid-link-token returned no token', null, null)
  }
  return data.link_token
}

// ---------- one-at-a-time lock + a tiny store the UI subscribes to ----------

type Listener = () => void
const listeners = new Set<Listener>()
let tail: Promise<void> = Promise.resolve()
let syncing = 0
/** Bumped after every background (auto) sync, so open screens know to reload. */
let backgroundSyncs = 0

function emit() {
  for (const listener of listeners) listener()
}

export function subscribePlaidSync(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isPlaidSyncing(): boolean {
  return syncing > 0
}

export function backgroundSyncCount(): number {
  return backgroundSyncs
}

/** Runs fn after every earlier locked call has settled — never two syncs at once. */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(async () => {
    syncing += 1
    emit()
    try {
      return await fn()
    } finally {
      syncing -= 1
      emit()
    }
  })
  tail = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

let pendingFullSync: Promise<PlaidSyncResponse> | null = null

/** Syncs every active bank. A full sync already queued or running is shared, not repeated. */
export function syncAllItems(): Promise<PlaidSyncResponse> {
  if (pendingFullSync) return pendingFullSync
  const run = exclusive(() => invokePlaid<PlaidSyncResponse>('plaid-sync', {}))
  pendingFullSync = run
  const clear = () => {
    if (pendingFullSync === run) pendingFullSync = null
  }
  run.then(clear, clear)
  return run
}

/** Syncs one bank whatever its status (the way back to active after update mode). */
export function syncOneItem(itemId: string): Promise<PlaidSyncResponse> {
  return exclusive(() => invokePlaid<PlaidSyncResponse>('plaid-sync', { item_id: itemId }))
}

/** Exchanges Link's public token; the function also runs the bank's first sync. */
export function exchangePublicToken(publicToken: string): Promise<PlaidExchangeResponse> {
  return exclusive(() => invokePlaid<PlaidExchangeResponse>('plaid-exchange', { public_token: publicToken }))
}

// ---------- auto-sync ----------

let checking = false
let lastAutoAttemptAt: number | null = null

/**
 * Called when the app opens after sign-in and whenever it returns to the foreground.
 * Reads the user's active banks (a database read, no Plaid call) and syncs only when one
 * is stale. Silent: failures are logged, never toasted.
 */
export async function autoSyncIfDue(userId: string): Promise<void> {
  if (checking || isPlaidSyncing()) return
  checking = true
  try {
    const { data, error } = await supabase
      .from('plaid_items')
      .select('status, last_synced_at')
      .eq('user_id', userId)
      .eq('status', 'active')
    if (error) {
      console.warn(`plaid auto-sync: could not read banks: ${error.message}`)
      return
    }
    const items = (data ?? []) as Pick<PlaidItem, 'status' | 'last_synced_at'>[]
    if (!isAutoSyncDue(items, new Date(), lastAutoAttemptAt)) return
    lastAutoAttemptAt = Date.now()
    try {
      await syncAllItems()
    } catch (err) {
      console.warn(`plaid auto-sync failed: ${err instanceof Error ? err.message : String(err)}`)
    }
    backgroundSyncs += 1
    emit()
  } finally {
    checking = false
  }
}
