// PP.9.3 — what a Plaid Link session needs to resume after bank-website (OAuth) sign-in
// sends the browser back to /plaid-oauth. Saved in localStorage just before Link opens,
// cleared when Link finishes, exits or fails. Pure: the storage is passed in, so
// plaidOAuth.test.ts covers save, read, stale and clear.

export const PLAID_OAUTH_STORAGE_KEY = 'pp.plaidOAuthResume'

/** Plaid link tokens live 4 hours; a saved token older than that cannot resume. */
export const PLAID_OAUTH_MAX_AGE_MS = 4 * 60 * 60 * 1000

export const PLAID_OAUTH_EXPIRED_MESSAGE = 'That bank sign-in expired. Try connecting again.'

/** The Link session to resume: a new connection, or update mode for one bank. */
export interface PlaidOAuthSession {
  token: string
  mode: 'new' | 'update'
  itemId?: string
}

export type PlaidOAuthResume =
  | { status: 'ready'; session: PlaidOAuthSession }
  | { status: 'missing' }
  | { status: 'stale' }

export type ResumeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

interface StoredResume extends PlaidOAuthSession {
  savedAt: number
}

/** localStorage, or null when the browser blocks it. */
export function browserStorage(): ResumeStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function savePlaidOAuthResume(storage: ResumeStorage | null, session: PlaidOAuthSession, now: number): void {
  if (!storage) return
  const stored: StoredResume = { token: session.token, mode: session.mode, savedAt: now }
  if (session.mode === 'update' && session.itemId) stored.itemId = session.itemId
  try {
    storage.setItem(PLAID_OAUTH_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Storage full or blocked: the pop-up flow still works, only the redirect return won't.
  }
}

export function readPlaidOAuthResume(storage: ResumeStorage | null, now: number): PlaidOAuthResume {
  let raw: string | null = null
  try {
    raw = storage?.getItem(PLAID_OAUTH_STORAGE_KEY) ?? null
  } catch {
    raw = null
  }
  if (!raw) return { status: 'missing' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { status: 'missing' }
  }
  if (!parsed || typeof parsed !== 'object') return { status: 'missing' }
  const value = parsed as Record<string, unknown>
  const { token, mode, itemId, savedAt } = value
  if (typeof token !== 'string' || !token) return { status: 'missing' }
  if (mode !== 'new' && mode !== 'update') return { status: 'missing' }
  if (mode === 'update' && (typeof itemId !== 'string' || !itemId)) return { status: 'missing' }
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return { status: 'missing' }

  const age = now - savedAt
  if (age > PLAID_OAUTH_MAX_AGE_MS || age < -PLAID_OAUTH_MAX_AGE_MS) return { status: 'stale' }

  return {
    status: 'ready',
    session: mode === 'update' ? { token, mode, itemId: itemId as string } : { token, mode },
  }
}

export function clearPlaidOAuthResume(storage: ResumeStorage | null): void {
  try {
    storage?.removeItem(PLAID_OAUTH_STORAGE_KEY)
  } catch {
    // Nothing to do.
  }
}

/** True when the URL is a Plaid OAuth return (Plaid appends oauth_state_id). */
export function isPlaidOAuthReturn(href: string): boolean {
  try {
    return Boolean(new URL(href).searchParams.get('oauth_state_id'))
  } catch {
    return false
  }
}
