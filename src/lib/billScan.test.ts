import { describe, it, expect, vi } from 'vitest'
import { toBillInsert } from './billScan'
import type { BillCandidate } from '@/types/billScan'

// billScan.ts imports the Supabase client, which throws without env vars; the mapper never uses it.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const netflix: BillCandidate = {
  name: 'Netflix',
  amount: 15.49,
  amount_type: 'fixed',
  category: 'subscriptions',
  due_rule: { type: 'monthly_day', day: 12 },
  autopay: true,
  is_debt: false,
  account_type: null,
  debt_balance: null,
  debt_apr: null,
  debt_min_payment: null,
  credit_limit: null,
  min_payment_percent: null,
  min_payment_floor: null,
  confidence: 0.95,
  evidence: 'charged 3x: Jul 12, Aug 12, Sep 12',
  source_file: 'checking-sep.pdf',
  possible_duplicate_of: null,
}

// Model output that doesn't match the declared types (bad enum, missing fields).
function malformed(overrides: Record<string, unknown>): BillCandidate {
  return { ...netflix, ...overrides } as unknown as BillCandidate
}

describe('toBillInsert', () => {
  it('maps a clean subscription candidate onto a bill insert', () => {
    expect(toBillInsert(netflix)).toEqual({
      name: 'Netflix',
      category: 'subscriptions',
      amount: 15.49,
      amount_type: 'fixed',
      due_rule: { type: 'monthly_day', day: 12 },
      autopay: true,
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
      notes: 'charged 3x: Jul 12, Aug 12, Sep 12',
    })
  })

  it('falls back to the other category for an unknown category', () => {
    expect(toBillInsert(malformed({ category: 'streaming' })).category).toBe('other')
  })

  it('falls back to monthly on the 1st when the due rule is missing', () => {
    expect(toBillInsert(malformed({ due_rule: undefined })).due_rule).toEqual({ type: 'monthly_day', day: 1 })
  })

  it('clamps an out-of-range due day to 31', () => {
    const insert = toBillInsert(malformed({ due_rule: { type: 'monthly_day', day: 40 } }))
    expect(insert.due_rule).toEqual({ type: 'monthly_day', day: 31 })
  })

  it('treats a missing debt flag and missing numbers as a non-debt bill with null fields', () => {
    const insert = toBillInsert(malformed({ is_debt: undefined, debt_apr: undefined, credit_limit: 'n/a' }))
    expect(insert.is_debt).toBe(false)
    expect(insert.debt_apr).toBeNull()
    expect(insert.credit_limit).toBeNull()
  })

  it('keeps account type and credit fields on a card payment candidate', () => {
    // Card statement: amount is the minimum payment; autopay unknown (null) maps to false.
    const card: BillCandidate = {
      ...netflix,
      name: 'Chase Sapphire',
      amount: 35,
      amount_type: 'estimate',
      category: 'debt',
      due_rule: { type: 'monthly_day', day: 25 },
      autopay: null,
      is_debt: true,
      account_type: 'card',
      debt_balance: 2450.12,
      debt_apr: 24.99,
      debt_min_payment: 35,
      credit_limit: 10000,
      min_payment_percent: 1,
      min_payment_floor: 35,
      evidence: 'statement closing Sep 28, minimum due Oct 25',
    }
    expect(toBillInsert(card)).toMatchObject({
      name: 'Chase Sapphire',
      amount: 35,
      amount_type: 'estimate',
      category: 'debt',
      autopay: false,
      is_debt: true,
      account_type: 'card',
      debt_balance: 2450.12,
      debt_apr: 24.99,
      debt_min_payment: 35,
      credit_limit: 10000,
      min_payment_percent: 1,
      min_payment_floor: 35,
    })
  })
})
