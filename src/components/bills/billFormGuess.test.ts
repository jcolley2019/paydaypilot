import { describe, it, expect } from 'vitest'
import type { Bill } from '@/types/bills'
import {
  ALL_TOUCHED,
  UNTOUCHED,
  applyNameGuess,
  guessHint,
  hasMoreOptionsValues,
} from './billFormGuess'

const BLANK = { category: 'other', cspBucket: 'fixed' } as const

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'b1',
    user_id: 'u1',
    name: 'Netflix',
    category: 'subscriptions',
    amount: 15.49,
    amount_type: 'fixed',
    due_rule: { type: 'monthly_day', day: 5 },
    autopay: false,
    payment_method: null,
    is_debt: false,
    debt_balance: null,
    debt_apr: null,
    debt_min_payment: null,
    account_type: null,
    credit_limit: null,
    min_payment_percent: null,
    min_payment_floor: null,
    csp_bucket: 'fixed',
    active: true,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('applyNameGuess', () => {
  it('fills both fields from the name when nothing was picked by hand', () => {
    expect(applyNameGuess('Netflix', BLANK, UNTOUCHED)).toEqual({
      category: 'subscriptions',
      cspBucket: 'fixed',
    })
    expect(applyNameGuess('Roth IRA', BLANK, UNTOUCHED)).toEqual({
      category: 'other',
      cspBucket: 'investment',
    })
  })

  it('re-guesses as the name changes while untouched', () => {
    const first = applyNameGuess('Car', BLANK, UNTOUCHED)
    expect(first.category).toBe('debt')
    expect(applyNameGuess('Car insurance', first, UNTOUCHED).category).toBe('insurance')
  })

  it('falls back to the blank defaults for an unknown or cleared name', () => {
    const guessed = applyNameGuess('Netflix', BLANK, UNTOUCHED)
    expect(applyNameGuess('', guessed, UNTOUCHED)).toEqual(BLANK)
    expect(applyNameGuess('Zorblax', guessed, UNTOUCHED)).toEqual(BLANK)
  })

  it('never overrides a manually picked category, but still guesses an untouched bucket', () => {
    const current = { category: 'family', cspBucket: 'fixed' } as const
    const touched = { category: true, cspBucket: false }
    expect(applyNameGuess('Vanguard', current, touched)).toEqual({
      category: 'family',
      cspBucket: 'investment',
    })
  })

  it('never overrides a manually picked bucket', () => {
    const current = { category: 'other', cspBucket: 'guilt_free' } as const
    const touched = { category: false, cspBucket: true }
    expect(applyNameGuess('Netflix', current, touched)).toEqual({
      category: 'subscriptions',
      cspBucket: 'guilt_free',
    })
  })

  it('leaves everything alone when both fields are touched (edit mode)', () => {
    const current = { category: 'food', cspBucket: 'savings' } as const
    expect(applyNameGuess('Netflix', current, ALL_TOUCHED)).toBe(current)
  })
})

describe('guessHint', () => {
  it('names a guessed category', () => {
    expect(guessHint({ category: 'subscriptions', cspBucket: 'fixed' }, UNTOUCHED)).toBe(
      'Category: Subscriptions — change under More options',
    )
  })

  it('names a guessed bucket, and both when both were guessed', () => {
    expect(guessHint({ category: 'other', cspBucket: 'investment' }, UNTOUCHED)).toBe(
      'CSP bucket: Investments — change under More options',
    )
    expect(guessHint({ category: 'debt', cspBucket: 'savings' }, UNTOUCHED)).toBe(
      'Category: Debt · CSP bucket: Savings Goals — change under More options',
    )
  })

  it('is silent when only the blank defaults apply', () => {
    expect(guessHint(BLANK, UNTOUCHED)).toBeNull()
  })

  it('does not call a manual pick a guess', () => {
    expect(guessHint({ category: 'subscriptions', cspBucket: 'fixed' }, ALL_TOUCHED)).toBeNull()
    expect(
      guessHint({ category: 'subscriptions', cspBucket: 'investment' }, { category: true, cspBucket: false }),
    ).toBe('CSP bucket: Investments — change under More options')
  })
})

describe('hasMoreOptionsValues', () => {
  it('is false for a bill whose extras are all defaults and whose category matches the guess', () => {
    expect(hasMoreOptionsValues(bill())).toBe(false)
  })

  it.each([
    ['debt on', { is_debt: true }],
    ['notes', { notes: 'call to cancel' }],
    ['payment method', { payment_method: 'Chase checking' }],
    ['estimate on', { amount_type: 'estimate' as const }],
    ['autopay on', { autopay: true }],
    ['non-guessed category', { category: 'family' as const }],
    ['non-guessed bucket', { csp_bucket: 'guilt_free' as const }],
  ])('is true with %s', (_label, overrides) => {
    expect(hasMoreOptionsValues(bill(overrides))).toBe(true)
  })

  it('ignores whitespace-only notes and payment method', () => {
    expect(hasMoreOptionsValues(bill({ notes: '  ', payment_method: ' ' }))).toBe(false)
  })
})
