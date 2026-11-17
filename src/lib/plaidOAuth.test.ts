// PP.9.3 — Plaid OAuth resume state + the link-token redirect_uri rule.
import { describe, expect, it } from 'vitest'
import {
  PLAID_OAUTH_MAX_AGE_MS,
  PLAID_OAUTH_STORAGE_KEY,
  clearPlaidOAuthResume,
  isPlaidOAuthReturn,
  readPlaidOAuthResume,
  savePlaidOAuthResume,
  type ResumeStorage,
} from './plaidOAuth'
import { buildLinkTokenRequest, linkTokenRedirectUri } from '../../supabase/functions/_shared/linkToken.ts'

function memoryStorage(): ResumeStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

const NOW = Date.parse('2026-11-17T18:00:00.000Z')

describe('save + read', () => {
  it('round-trips a new-connection session', () => {
    const storage = memoryStorage()
    savePlaidOAuthResume(storage, { token: 'link-sandbox-1', mode: 'new' }, NOW)
    expect(readPlaidOAuthResume(storage, NOW + 60_000)).toEqual({
      status: 'ready',
      session: { token: 'link-sandbox-1', mode: 'new' },
    })
  })

  it('round-trips a reconnect with its item id', () => {
    const storage = memoryStorage()
    savePlaidOAuthResume(storage, { token: 'link-sandbox-2', mode: 'update', itemId: 'item-9' }, NOW)
    expect(readPlaidOAuthResume(storage, NOW)).toEqual({
      status: 'ready',
      session: { token: 'link-sandbox-2', mode: 'update', itemId: 'item-9' },
    })
  })

  it('does not keep an item id on a new connection', () => {
    const storage = memoryStorage()
    savePlaidOAuthResume(storage, { token: 't', mode: 'new', itemId: 'stray' }, NOW)
    expect(JSON.parse(storage.data.get(PLAID_OAUTH_STORAGE_KEY)!)).not.toHaveProperty('itemId')
  })

  it('a later save replaces the earlier one', () => {
    const storage = memoryStorage()
    savePlaidOAuthResume(storage, { token: 'old', mode: 'new' }, NOW)
    savePlaidOAuthResume(storage, { token: 'new', mode: 'update', itemId: 'i' }, NOW)
    expect(readPlaidOAuthResume(storage, NOW)).toMatchObject({ status: 'ready', session: { token: 'new' } })
  })

  it('reads missing when nothing is saved, storage is blocked, or the value is junk', () => {
    expect(readPlaidOAuthResume(memoryStorage(), NOW)).toEqual({ status: 'missing' })
    expect(readPlaidOAuthResume(null, NOW)).toEqual({ status: 'missing' })
    const throwing: ResumeStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(() => savePlaidOAuthResume(throwing, { token: 't', mode: 'new' }, NOW)).not.toThrow()
    expect(readPlaidOAuthResume(throwing, NOW)).toEqual({ status: 'missing' })
    expect(() => clearPlaidOAuthResume(throwing)).not.toThrow()

    const storage = memoryStorage()
    for (const junk of ['not json', 'null', '[]', '{"token":"","mode":"new","savedAt":1}', '{"token":"t","mode":"x","savedAt":1}']) {
      storage.data.set(PLAID_OAUTH_STORAGE_KEY, junk)
      expect(readPlaidOAuthResume(storage, NOW)).toEqual({ status: 'missing' })
    }
    storage.data.set(PLAID_OAUTH_STORAGE_KEY, JSON.stringify({ token: 't', mode: 'update', savedAt: NOW }))
    expect(readPlaidOAuthResume(storage, NOW)).toEqual({ status: 'missing' })
    storage.data.set(PLAID_OAUTH_STORAGE_KEY, JSON.stringify({ token: 't', mode: 'new' }))
    expect(readPlaidOAuthResume(storage, NOW)).toEqual({ status: 'missing' })
  })
})

describe('stale', () => {
  it('is ready right up to the token lifetime, stale after it', () => {
    const storage = memoryStorage()
    savePlaidOAuthResume(storage, { token: 't', mode: 'new' }, NOW)
    expect(readPlaidOAuthResume(storage, NOW + PLAID_OAUTH_MAX_AGE_MS).status).toBe('ready')
    expect(readPlaidOAuthResume(storage, NOW + PLAID_OAUTH_MAX_AGE_MS + 1)).toEqual({ status: 'stale' })
  })

  it('treats a save far in the future (clock jump) as stale', () => {
    const storage = memoryStorage()
    savePlaidOAuthResume(storage, { token: 't', mode: 'new' }, NOW + PLAID_OAUTH_MAX_AGE_MS + 1)
    expect(readPlaidOAuthResume(storage, NOW)).toEqual({ status: 'stale' })
  })
})

describe('clear', () => {
  it('removes the saved session', () => {
    const storage = memoryStorage()
    savePlaidOAuthResume(storage, { token: 't', mode: 'new' }, NOW)
    clearPlaidOAuthResume(storage)
    expect(storage.data.size).toBe(0)
    expect(readPlaidOAuthResume(storage, NOW)).toEqual({ status: 'missing' })
    expect(() => clearPlaidOAuthResume(null)).not.toThrow()
  })
})

describe('isPlaidOAuthReturn', () => {
  it('needs an oauth_state_id', () => {
    expect(isPlaidOAuthReturn('https://paydaypilot-sepia.vercel.app/plaid-oauth?oauth_state_id=abc-123')).toBe(true)
    expect(isPlaidOAuthReturn('https://paydaypilot-sepia.vercel.app/plaid-oauth')).toBe(false)
    expect(isPlaidOAuthReturn('https://paydaypilot-sepia.vercel.app/plaid-oauth?oauth_state_id=')).toBe(false)
    expect(isPlaidOAuthReturn('not a url')).toBe(false)
  })
})

describe('link token redirect_uri', () => {
  const URI = 'https://paydaypilot-sepia.vercel.app/plaid-oauth'

  it('is sent only for the redirect URI origin', () => {
    expect(linkTokenRedirectUri('https://paydaypilot-sepia.vercel.app', URI)).toBe(URI)
    expect(linkTokenRedirectUri('http://localhost:5173', URI)).toBeNull()
    expect(linkTokenRedirectUri('https://paydaypilot-sepia.vercel.app.evil.com', URI)).toBeNull()
    expect(linkTokenRedirectUri(null, URI)).toBeNull()
    expect(linkTokenRedirectUri('https://paydaypilot-sepia.vercel.app', undefined)).toBeNull()
    expect(linkTokenRedirectUri('https://paydaypilot-sepia.vercel.app', 'not a url')).toBeNull()
  })

  it('goes on new and update-mode requests alike', () => {
    const fresh = buildLinkTokenRequest({ userId: 'u', redirectUri: URI })
    expect(fresh).toMatchObject({ products: ['transactions'], redirect_uri: URI })
    const update = buildLinkTokenRequest({ userId: 'u', accessToken: 'access-x', redirectUri: URI })
    expect(update).toMatchObject({ access_token: 'access-x', redirect_uri: URI })
    expect(update).not.toHaveProperty('products')
    expect(buildLinkTokenRequest({ userId: 'u', redirectUri: null })).not.toHaveProperty('redirect_uri')
  })
})
