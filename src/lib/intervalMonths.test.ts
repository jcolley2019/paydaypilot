import { describe, it, expect } from 'vitest'
import { describeDueRule, isValidIntervalMonths, nextDueDate } from './dueRules'
import { occurrencesForRule } from './paydays'
import { planInstanceSync } from './horizonPlan'
import { billMonthlyAmount, cspBreakdown } from './plan'
import { addDays, toISODate } from './localDate'
import { buildDueRule, intervalMonthsRule } from '@/components/bills/scanDraft'
import type { Bill, DueRule } from '@/types/bills'
import type { IncomeSource } from '@/types/payday'

const iso = (dates: Date[]) => dates.map(toISODate)

function months(n: number, anchor: string): DueRule {
  return { type: 'interval_months', months: n, anchor }
}

describe('interval_months — nextDueDate', () => {
  it('returns the anchor itself when from is on or before it', () => {
    expect(nextDueDate(months(3, '2026-01-15'), new Date(2026, 0, 1))).toEqual(new Date(2026, 0, 15))
    expect(nextDueDate(months(3, '2026-01-15'), new Date(2026, 0, 15))).toEqual(new Date(2026, 0, 15))
  })

  it('steps quarterly across a year boundary', () => {
    const rule = months(3, '2026-10-15')
    expect(nextDueDate(rule, new Date(2026, 9, 16))).toEqual(new Date(2027, 0, 15))
    expect(nextDueDate(rule, new Date(2027, 0, 15))).toEqual(new Date(2027, 0, 15))
    expect(nextDueDate(rule, new Date(2027, 0, 16))).toEqual(new Date(2027, 3, 15))
  })

  it('clamps a 31st anchor to the last day of shorter months without drifting', () => {
    const rule = months(3, '2026-01-31')
    expect(nextDueDate(rule, new Date(2026, 1, 1))).toEqual(new Date(2026, 3, 30)) // Apr 30
    expect(nextDueDate(rule, new Date(2026, 4, 1))).toEqual(new Date(2026, 6, 31)) // back on Jul 31
    // Every 2 months from Dec 31 lands on Feb 28 off-leap, then Apr 30, then Jun 30.
    const bimonthly = months(2, '2025-12-31')
    expect(nextDueDate(bimonthly, new Date(2026, 0, 1))).toEqual(new Date(2026, 1, 28))
    expect(nextDueDate(bimonthly, new Date(2026, 2, 1))).toEqual(new Date(2026, 3, 30))
  })

  it('clamps a Feb 29 anchor to Feb 28 off-leap and returns to Feb 29 on the next leap year', () => {
    const rule = months(12, '2028-02-29')
    expect(nextDueDate(rule, new Date(2028, 2, 1))).toEqual(new Date(2029, 1, 28))
    expect(nextDueDate(rule, new Date(2031, 2, 1))).toEqual(new Date(2032, 1, 29))
  })

  it('steps yearly across two years', () => {
    const rule = months(12, '2026-03-10')
    expect(nextDueDate(rule, new Date(2026, 2, 11))).toEqual(new Date(2027, 2, 10))
    expect(nextDueDate(rule, new Date(2027, 2, 11))).toEqual(new Date(2028, 2, 10))
  })

  it('handles semi-annual and 24-month intervals', () => {
    expect(nextDueDate(months(6, '2026-05-20'), new Date(2026, 5, 1))).toEqual(new Date(2026, 10, 20))
    expect(nextDueDate(months(24, '2026-05-20'), new Date(2026, 5, 1))).toEqual(new Date(2028, 4, 20))
  })
})

describe('interval_months — describeDueRule', () => {
  it('describes quarterly and semi-annual intervals', () => {
    expect(describeDueRule(months(3, '2026-01-15'))).toBe('Every 3 months (from Jan 15)')
    expect(describeDueRule(months(6, '2026-07-01'))).toBe('Every 6 months (from Jul 1)')
  })

  it('describes 12 months as yearly', () => {
    expect(describeDueRule(months(12, '2026-01-15'))).toBe('Yearly on Jan 15')
  })
})

describe('interval_months — isValidIntervalMonths', () => {
  it('accepts whole months from 2 to 24 only', () => {
    expect([2, 3, 12, 24].every(isValidIntervalMonths)).toBe(true)
    expect([0, 1, 25, 2.5, Number.NaN].some(isValidIntervalMonths)).toBe(false)
  })
})

describe('interval_months — occurrencesForRule', () => {
  it('finds no hit in a 90-day window between yearly dates', () => {
    const from = new Date(2026, 3, 1)
    expect(occurrencesForRule(months(12, '2026-01-15'), from, addDays(from, 90))).toEqual([])
  })

  it('finds exactly one hit in a 90-day window that holds a semi-annual date', () => {
    const from = new Date(2026, 5, 1)
    expect(iso(occurrencesForRule(months(6, '2026-01-15'), from, addDays(from, 90)))).toEqual(['2026-07-15'])
  })

  it('walks a quarterly 31st anchor across a year with clamping', () => {
    const dates = occurrencesForRule(months(3, '2026-01-31'), new Date(2026, 0, 1), new Date(2026, 11, 31))
    expect(iso(dates)).toEqual(['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31'])
  })
})

describe('interval_months — horizon planning', () => {
  it('plans one instance per occurrence with no special casing', () => {
    const bill = { id: 'bill-1', amount: 300, due_rule: months(3, '2026-01-15') }
    const plan = planInstanceSync([bill], [], new Date(2026, 6, 1), new Date(2026, 9, 29))
    expect(plan.inserts).toEqual([
      { bill_id: 'bill-1', due_date: '2026-07-15', amount: 300 },
      { bill_id: 'bill-1', due_date: '2026-10-15', amount: 300 },
    ])
  })
})

describe('interval_months — import review draft', () => {
  const draft = { type: 'interval_months' as const, day: null, weeks: '2', months: '6', anchor: '2026-03-01', date: '' }

  it('builds the rule from a complete draft', () => {
    expect(buildDueRule(draft)).toEqual(months(6, '2026-03-01'))
    expect(intervalMonthsRule('12', '2026-08-01')).toEqual(months(12, '2026-08-01'))
  })

  it('rejects months outside 2–24, blanks and bad dates', () => {
    expect(buildDueRule({ ...draft, months: '1' })).toBeNull()
    expect(buildDueRule({ ...draft, months: '25' })).toBeNull()
    expect(buildDueRule({ ...draft, months: '' })).toBeNull()
    expect(buildDueRule({ ...draft, anchor: '2026-02-30' })).toBeNull()
  })
})

function bill(overrides: Partial<Bill>): Bill {
  return {
    id: 'bill-1',
    user_id: 'user-1',
    name: 'Bill',
    category: 'other',
    amount: 100,
    amount_type: 'fixed',
    due_rule: { type: 'monthly_day', day: 1 },
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

describe('interval_months — monthly normalization', () => {
  it('counts amount / months per month', () => {
    expect(billMonthlyAmount({ amount: 600, due_rule: months(3, '2026-01-15') })).toBe(200)
    expect(billMonthlyAmount({ amount: 600, due_rule: months(6, '2026-01-15') })).toBe(100)
    expect(billMonthlyAmount({ amount: 1200, due_rule: months(12, '2026-01-15') })).toBe(100)
  })

  it('feeds the CSP fixed total at the monthly rate', () => {
    const income: IncomeSource = {
      id: 'inc-1',
      user_id: 'user-1',
      name: 'Job',
      net_amount: 5000,
      schedule: 'monthly',
      anchor_date: null,
      semimonthly_days: null,
      monthly_day: 1,
      active: true,
    }
    const bills = [
      bill({ id: 'rent', amount: 2000 }),
      bill({ id: 'car-ins', amount: 900, due_rule: months(6, '2026-03-01') }),
      bill({ id: 'domain', amount: 120, due_rule: months(12, '2026-08-01') }),
    ]
    const result = cspBreakdown(bills, [], [income])
    expect(result.fixed.actual).toBeCloseTo(2000 + 150 + 10)
    expect(result.fixed.percent).toBeCloseTo(43.2)
  })
})
