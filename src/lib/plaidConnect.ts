// PP.9.2 — pure helpers for the Bank connections section and the auto-sync decision.
// No React, no Supabase: everything here is covered by plaidConnect.test.ts.
import type { PlaidItem } from '@/types/plaid'

/** Auto-sync runs only when an active bank's last sync is older than this. */
export const AUTO_SYNC_STALE_MS = 15 * 60 * 1000

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** The most recent last_synced_at among the given items, or null when none has synced. */
export function latestSync(items: Pick<PlaidItem, 'last_synced_at'>[]): string | null {
  let latest: string | null = null
  let latestMs = -Infinity
  for (const item of items) {
    if (!item.last_synced_at) continue
    const ms = Date.parse(item.last_synced_at)
    if (Number.isFinite(ms) && ms > latestMs) {
      latestMs = ms
      latest = item.last_synced_at
    }
  }
  return latest
}

/** "Synced just now" / "Synced 5 min ago" / "Synced 3 hr ago" / "Synced yesterday" / "Synced 4 days ago". */
export function syncedLabel(lastSyncedAt: string | null, now: Date): string {
  const ms = lastSyncedAt ? Date.parse(lastSyncedAt) : NaN
  if (!Number.isFinite(ms)) return 'Not synced yet'
  const age = Math.max(0, now.getTime() - ms)
  if (age < MINUTE) return 'Synced just now'
  if (age < HOUR) return `Synced ${Math.floor(age / MINUTE)} min ago`
  if (age < DAY) return `Synced ${Math.floor(age / HOUR)} hr ago`
  const days = Math.floor(age / DAY)
  return days === 1 ? 'Synced yesterday' : `Synced ${days} days ago`
}

/** "<name> ··<mask>", or just the name when the bank gives no mask. */
export function accountRowLabel(name: string, mask: string | null): string {
  const trimmed = mask?.trim()
  return trimmed ? `${name} ··${trimmed}` : name
}

export function transactionsImportedLabel(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'transaction' : 'transactions'} imported`
}

export function formatBalance(balance: number | null): string {
  if (balance === null || !Number.isFinite(balance)) return '—'
  return balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/**
 * True when at least one active bank has never synced or last synced more than
 * AUTO_SYNC_STALE_MS ago. A failed auto-sync does not move last_synced_at, so
 * lastAttemptAt (ms) holds the next try back for the same window.
 */
export function isAutoSyncDue(
  items: Pick<PlaidItem, 'status' | 'last_synced_at'>[],
  now: Date,
  lastAttemptAt: number | null = null,
): boolean {
  const nowMs = now.getTime()
  if (lastAttemptAt !== null && nowMs - lastAttemptAt < AUTO_SYNC_STALE_MS) return false
  return items.some((item) => {
    if (item.status !== 'active') return false
    const ms = item.last_synced_at ? Date.parse(item.last_synced_at) : NaN
    return !Number.isFinite(ms) || nowMs - ms > AUTO_SYNC_STALE_MS
  })
}

export const PLAID_NOT_ENABLED_MESSAGE = "Bank connections aren't turned on for this account yet."
export const PLAID_ALREADY_CONNECTED_MESSAGE = 'That bank is already connected.'
export const PLAID_GENERIC_MESSAGE = "Couldn't reach the bank service. Try again."

/** Plain-words toast text for a failed Plaid function call (status null = no HTTP answer). */
export function plaidErrorMessage(status: number | null, code: string | null): string {
  if (status === 403) return PLAID_NOT_ENABLED_MESSAGE
  if (status === 409 && code === 'already_connected') return PLAID_ALREADY_CONNECTED_MESSAGE
  return PLAID_GENERIC_MESSAGE
}
