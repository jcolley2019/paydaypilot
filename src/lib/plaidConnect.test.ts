// PP.9.2 — Bank connections helpers.
import { describe, expect, it } from 'vitest'
import {
  AUTO_SYNC_STALE_MS,
  PLAID_ALREADY_CONNECTED_MESSAGE,
  PLAID_GENERIC_MESSAGE,
  PLAID_NOT_ENABLED_MESSAGE,
  accountRowLabel,
  formatBalance,
  isAutoSyncDue,
  latestSync,
  plaidErrorMessage,
  syncedLabel,
  transactionsImportedLabel,
} from './plaidConnect'

const NOW = new Date('2026-11-16T18:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('syncedLabel', () => {
  it('says not synced yet when there is no timestamp', () => {
    expect(syncedLabel(null, NOW)).toBe('Not synced yet')
    expect(syncedLabel('not a date', NOW)).toBe('Not synced yet')
  })

  it('reads just now under a minute, and for a clock slightly ahead', () => {
    expect(syncedLabel(ago(20 * 1000), NOW)).toBe('Synced just now')
    expect(syncedLabel(ago(-30 * 1000), NOW)).toBe('Synced just now')
  })

  it('counts minutes, hours, yesterday and days', () => {
    expect(syncedLabel(ago(MIN), NOW)).toBe('Synced 1 min ago')
    expect(syncedLabel(ago(59 * MIN), NOW)).toBe('Synced 59 min ago')
    expect(syncedLabel(ago(HOUR), NOW)).toBe('Synced 1 hr ago')
    expect(syncedLabel(ago(23 * HOUR + 59 * MIN), NOW)).toBe('Synced 23 hr ago')
    expect(syncedLabel(ago(DAY), NOW)).toBe('Synced yesterday')
    expect(syncedLabel(ago(4 * DAY + 3 * HOUR), NOW)).toBe('Synced 4 days ago')
  })
})

describe('latestSync', () => {
  it('picks the most recent timestamp and skips missing ones', () => {
    const items = [{ last_synced_at: ago(3 * HOUR) }, { last_synced_at: null }, { last_synced_at: ago(5 * MIN) }]
    expect(latestSync(items)).toBe(ago(5 * MIN))
  })

  it('is null when nothing has synced', () => {
    expect(latestSync([])).toBeNull()
    expect(latestSync([{ last_synced_at: null }])).toBeNull()
  })
})

describe('accountRowLabel', () => {
  it('adds the mask after two middle dots', () => {
    expect(accountRowLabel('Plaid Checking', '0000')).toBe('Plaid Checking ··0000')
  })

  it('is just the name without a mask', () => {
    expect(accountRowLabel('Savings', null)).toBe('Savings')
    expect(accountRowLabel('Savings', '  ')).toBe('Savings')
  })
})

describe('transactionsImportedLabel', () => {
  it('pluralises and groups thousands', () => {
    expect(transactionsImportedLabel(0)).toBe('0 transactions imported')
    expect(transactionsImportedLabel(1)).toBe('1 transaction imported')
    expect(transactionsImportedLabel(1234)).toBe('1,234 transactions imported')
  })
})

describe('formatBalance', () => {
  it('formats dollars and shows a dash when unknown', () => {
    expect(formatBalance(1234.5)).toBe('$1,234.50')
    expect(formatBalance(-12)).toBe('-$12.00')
    expect(formatBalance(null)).toBe('—')
  })
})

describe('isAutoSyncDue', () => {
  it('is false with no banks — no Plaid calls for users without connections', () => {
    expect(isAutoSyncDue([], NOW)).toBe(false)
  })

  it('ignores banks that are not active', () => {
    expect(isAutoSyncDue([{ status: 'login_required', last_synced_at: ago(DAY) }], NOW)).toBe(false)
    expect(isAutoSyncDue([{ status: 'removed', last_synced_at: null }], NOW)).toBe(false)
  })

  it('is due when an active bank is older than 15 minutes or never synced', () => {
    expect(isAutoSyncDue([{ status: 'active', last_synced_at: ago(AUTO_SYNC_STALE_MS + 1) }], NOW)).toBe(true)
    expect(isAutoSyncDue([{ status: 'active', last_synced_at: null }], NOW)).toBe(true)
  })

  it('is not due within 15 minutes', () => {
    expect(isAutoSyncDue([{ status: 'active', last_synced_at: ago(AUTO_SYNC_STALE_MS) }], NOW)).toBe(false)
    expect(isAutoSyncDue([{ status: 'active', last_synced_at: ago(2 * MIN) }], NOW)).toBe(false)
  })

  it('is due when any one active bank is stale', () => {
    const items = [
      { status: 'active' as const, last_synced_at: ago(MIN) },
      { status: 'active' as const, last_synced_at: ago(HOUR) },
    ]
    expect(isAutoSyncDue(items, NOW)).toBe(true)
  })

  it('holds off for 15 minutes after the last auto attempt (a failed sync leaves the bank stale)', () => {
    const stale = [{ status: 'active' as const, last_synced_at: ago(DAY) }]
    expect(isAutoSyncDue(stale, NOW, NOW.getTime() - 5 * MIN)).toBe(false)
    expect(isAutoSyncDue(stale, NOW, NOW.getTime() - AUTO_SYNC_STALE_MS)).toBe(true)
  })
})

describe('plaidErrorMessage', () => {
  it('maps 403 to the not-enabled message', () => {
    expect(plaidErrorMessage(403, "Bank connections aren't enabled for this account")).toBe(PLAID_NOT_ENABLED_MESSAGE)
  })

  it('maps 409 already_connected', () => {
    expect(plaidErrorMessage(409, 'already_connected')).toBe(PLAID_ALREADY_CONNECTED_MESSAGE)
  })

  it('falls back to the generic message for everything else', () => {
    expect(plaidErrorMessage(409, 'something_else')).toBe(PLAID_GENERIC_MESSAGE)
    expect(plaidErrorMessage(502, 'plaid_error')).toBe(PLAID_GENERIC_MESSAGE)
    expect(plaidErrorMessage(401, null)).toBe(PLAID_GENERIC_MESSAGE)
    expect(plaidErrorMessage(null, null)).toBe(PLAID_GENERIC_MESSAGE)
  })
})
