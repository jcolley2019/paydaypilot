import { describe, it, expect } from 'vitest'
import {
  monthlyIncome,
  cspBreakdown,
  worstCspCategory,
  babyStepStatus,
  snowballOrder,
  findOversubscribedPaycheck,
  suggestOversubscriptionFixes,
} from './plan'
import type { Bill } from '@/types/bills'
import type { Bucket } from '@/types/buckets'
import type { IncomeSource } from '@/types/payday'

function income(overrides: Partial<IncomeSource>): IncomeSource {
  return {
    id: 'src-1',
    user_id: 'user-1',
    name: 'Main job',
    net_amount: 1000,
    schedule: 'biweekly',
    anchor_date: '2026-07-03',
    semimonthly_days: null,
    monthly_day: null,
    active: true,
    ...overrides,
  }
}

function bill(overrides: Partial<Bill>): Bill {
  return {
    id: 'bill-1',
    user_id: 'user-1',
    name: 'Rent',
    category: 'housing',
    amount: 1000,
    amount_type: 'fixed',
    due_rule: { type: 'monthly_day', day: 1 },
    autopay: false,
    payment_method: null,
    is_debt: false,
    debt_balance: null,
    debt_apr: null,
    debt_min_payment: null,
    csp_bucket: 'fixed',
    active: true,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function bucket(overrides: Partial<Bucket>): Bucket {
  return {
    id: 'bucket-1',
    user_id: 'user-1',
    name: 'Emergency Fund',
    icon: 'ShieldCheck',
    color: '#22c55e',
    kind: 'emergency',
    target_amount: 1000,
    target_date: null,
    current_balance: 0,
    per_paycheck: 0,
    sort: 0,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('monthlyIncome', () => {
  it('normalizes weekly to monthly', () => {
    expect(monthlyIncome([income({ schedule: 'weekly', net_amount: 500 })])).toBeCloseTo(
      (500 * 52) / 12,
    )
  })

  it('normalizes biweekly to monthly', () => {
    expect(monthlyIncome([income({ schedule: 'biweekly', net_amount: 1000 })])).toBeCloseTo(
      (1000 * 26) / 12,
    )
  })

  it('normalizes semimonthly to monthly', () => {
    expect(monthlyIncome([income({ schedule: 'semimonthly', net_amount: 1500 })])).toBe(3000)
  })

  it('normalizes monthly to monthly (identity)', () => {
    expect(monthlyIncome([income({ schedule: 'monthly', net_amount: 4000 })])).toBe(4000)
  })

  it('excludes irregular income', () => {
    expect(monthlyIncome([income({ schedule: 'irregular', net_amount: 9999 })])).toBe(0)
  })

  it('excludes inactive income sources', () => {
    expect(monthlyIncome([income({ active: false, net_amount: 5000 })])).toBe(0)
  })

  it('sums across multiple sources', () => {
    const sources = [
      income({ id: 's1', schedule: 'monthly', net_amount: 1000 }),
      income({ id: 's2', schedule: 'semimonthly', net_amount: 500 }),
    ]
    expect(monthlyIncome(sources)).toBe(1000 + 1000)
  })
})

describe('cspBreakdown', () => {
  const sources = [income({ schedule: 'monthly', net_amount: 5000 })]

  it('assigns fixed bills to the fixed category', () => {
    const bills = [bill({ csp_bucket: 'fixed', amount: 2750 })]
    const result = cspBreakdown(bills, [], sources)
    expect(result.fixed.actual).toBe(2750)
    expect(result.fixed.percent).toBeCloseTo(55)
    expect(result.fixed.status).toBe('within')
  })

  it('flags fixed under and over the 50-60 band', () => {
    const under = cspBreakdown([bill({ csp_bucket: 'fixed', amount: 1000 })], [], sources)
    expect(under.fixed.status).toBe('under')
    const over = cspBreakdown([bill({ csp_bucket: 'fixed', amount: 3500 })], [], sources)
    expect(over.fixed.status).toBe('over')
  })

  it('combines investment bills and invest-kind bucket contributions', () => {
    const bills = [bill({ csp_bucket: 'investment', amount: 200 })]
    const buckets = [bucket({ kind: 'invest', per_paycheck: 100 })]
    // 1 paycheck/month (monthly schedule) -> bucket contributes 100/mo
    const result = cspBreakdown(bills, buckets, sources)
    expect(result.investment.actual).toBe(300)
  })

  it('combines savings-tagged bills with goal and emergency bucket contributions', () => {
    const bills = [bill({ csp_bucket: 'savings', amount: 100 })]
    const buckets = [
      bucket({ id: 'b1', kind: 'goal', per_paycheck: 50 }),
      bucket({ id: 'b2', kind: 'emergency', per_paycheck: 25 }),
      bucket({ id: 'b3', kind: 'invest', per_paycheck: 999 }), // must not leak into savings
    ]
    const result = cspBreakdown(bills, buckets, sources)
    expect(result.savings.actual).toBe(175)
  })

  it('computes guilt_free as the remainder and never lets it go negative', () => {
    const bills = [bill({ csp_bucket: 'fixed', amount: 2000 })]
    const result = cspBreakdown(bills, [], sources)
    expect(result.guilt_free.actual).toBe(3000)
    expect(result.overCommitted).toBe(false)
  })

  it('clamps guilt_free to 0 and flags overCommitted when spend exceeds income', () => {
    const bills = [bill({ csp_bucket: 'fixed', amount: 6000 })]
    const result = cspBreakdown(bills, [], sources)
    expect(result.guilt_free.actual).toBe(0)
    expect(result.overCommitted).toBe(true)
  })

  it('excludes inactive bills and buckets from every category', () => {
    const bills = [bill({ csp_bucket: 'fixed', amount: 5000, active: false })]
    const buckets = [bucket({ kind: 'goal', per_paycheck: 500, active: false })]
    const result = cspBreakdown(bills, buckets, sources)
    expect(result.fixed.actual).toBe(0)
    expect(result.savings.actual).toBe(0)
  })
})

describe('worstCspCategory', () => {
  const sources = [income({ schedule: 'monthly', net_amount: 5000 })]

  it('returns null when every category is within its band', () => {
    // fixed 55%, investment 10%, savings 7.5%, guilt_free is the remainder (27.5%)
    const bills = [
      bill({ id: 'f', csp_bucket: 'fixed', amount: 2750 }),
      bill({ id: 'i', csp_bucket: 'investment', amount: 500 }),
      bill({ id: 's', csp_bucket: 'savings', amount: 375 }),
    ]
    const breakdown = cspBreakdown(bills, [], sources)
    expect(worstCspCategory(breakdown)).toBeNull()
  })

  it('picks the category with the largest deviation from its band', () => {
    const bills = [bill({ id: 'f', csp_bucket: 'fixed', amount: 4500 })] // 90%, way over 50-60
    const breakdown = cspBreakdown(bills, [], sources)
    expect(worstCspCategory(breakdown)).toBe('fixed')
  })
})

describe('babyStepStatus', () => {
  it('is step 1 with progress toward $1,000 when the emergency fund is under target', () => {
    const buckets = [bucket({ kind: 'emergency', current_balance: 650 })]
    const result = babyStepStatus(buckets, [])
    expect(result.currentStep).toBe(1)
    expect(result.step1Done).toBe(false)
    expect(result.progress).toEqual({ current: 650, target: 1000 })
    expect(result.nextAction).toContain('$350')
  })

  it('completes step 1 exactly at the $1,000 boundary', () => {
    const buckets = [bucket({ kind: 'emergency', current_balance: 1000 })]
    const result = babyStepStatus(buckets, [])
    expect(result.step1Done).toBe(true)
  })

  it('moves to step 2 when step 1 is done and active debt remains', () => {
    const buckets = [bucket({ kind: 'emergency', current_balance: 1000 })]
    const bills = [bill({ is_debt: true, debt_balance: 500, name: 'Credit card' })]
    const result = babyStepStatus(buckets, bills)
    expect(result.currentStep).toBe(2)
    expect(result.step2Done).toBe(false)
    expect(result.nextAction).toContain('Credit card')
  })

  it('treats a debt bill with a zero balance as paid off', () => {
    const buckets = [bucket({ kind: 'emergency', current_balance: 1000 })]
    const bills = [bill({ is_debt: true, debt_balance: 0 })]
    const result = babyStepStatus(buckets, bills)
    expect(result.step2Done).toBe(true)
  })

  it('moves to step 3 once debt is clear and checks against 3 months of fixed costs', () => {
    const buckets = [bucket({ kind: 'emergency', current_balance: 1000 })]
    const bills = [bill({ csp_bucket: 'fixed', amount: 1000 })]
    const result = babyStepStatus(buckets, bills)
    expect(result.currentStep).toBe(3)
    expect(result.threeMonthTarget).toBe(3000)
    expect(result.step3Done).toBe(false)
  })

  it('completes step 3 exactly at the 3-month boundary', () => {
    const buckets = [bucket({ kind: 'emergency', current_balance: 3000 })]
    const bills = [bill({ csp_bucket: 'fixed', amount: 1000 })]
    const result = babyStepStatus(buckets, bills)
    expect(result.step3Done).toBe(true)
    expect(result.currentStep).toBe(4)
  })

  it('does not mark step 3 done off a zero-dollar window when there are no fixed bills', () => {
    const buckets = [bucket({ kind: 'emergency', current_balance: 5000 })]
    const result = babyStepStatus(buckets, [])
    expect(result.threeMonthTarget).toBe(0)
    expect(result.step3Done).toBe(false)
    expect(result.currentStep).toBe(3)
  })
})

describe('snowballOrder', () => {
  const debts = [
    bill({ id: 'd1', is_debt: true, name: 'Big loan', debt_balance: 10000, debt_apr: 5 }),
    bill({ id: 'd2', is_debt: true, name: 'Small card', debt_balance: 500, debt_apr: 22 }),
    bill({ id: 'd3', is_debt: true, name: 'Mid card', debt_balance: 2000, debt_apr: 15 }),
  ]

  it('orders the snowball list smallest balance first', () => {
    const result = snowballOrder(debts)
    expect(result.snowball.map((b) => b.id)).toEqual(['d2', 'd3', 'd1'])
  })

  it('orders the avalanche list highest APR first', () => {
    const result = snowballOrder(debts)
    expect(result.avalanche.map((b) => b.id)).toEqual(['d2', 'd3', 'd1'])
  })

  it('produces a different order when APR and balance disagree', () => {
    const mixed = [
      bill({ id: 'd1', is_debt: true, debt_balance: 100, debt_apr: 3 }),
      bill({ id: 'd2', is_debt: true, debt_balance: 5000, debt_apr: 25 }),
    ]
    const result = snowballOrder(mixed)
    expect(result.snowball.map((b) => b.id)).toEqual(['d1', 'd2'])
    expect(result.avalanche.map((b) => b.id)).toEqual(['d2', 'd1'])
  })

  it('excludes inactive bills, non-debt bills, and paid-off debts', () => {
    const bills = [
      bill({ id: 'inactive', is_debt: true, debt_balance: 100, active: false }),
      bill({ id: 'not-debt', is_debt: false, debt_balance: 100 }),
      bill({ id: 'paid-off', is_debt: true, debt_balance: 0 }),
      bill({ id: 'kept', is_debt: true, debt_balance: 100 }),
    ]
    const result = snowballOrder(bills)
    expect(result.snowball.map((b) => b.id)).toEqual(['kept'])
  })
})

describe('findOversubscribedPaycheck', () => {
  const paychecks = [
    { id: 'pc-1', pay_date: '2026-07-03', expected_amount: 1000 },
    { id: 'pc-2', pay_date: '2026-07-17', expected_amount: 1000 },
  ]

  it('returns null when no paycheck is oversubscribed', () => {
    const totals = new Map([['pc-1', 500]])
    expect(findOversubscribedPaycheck(paychecks, totals, 100)).toBeNull()
  })

  it('finds the earliest oversubscribed paycheck', () => {
    const totals = new Map([
      ['pc-1', 500],
      ['pc-2', 1200],
    ])
    const result = findOversubscribedPaycheck(paychecks, totals, 0)
    expect(result).toEqual({ paycheckId: 'pc-2', payDate: '2026-07-17', amountOver: 200 })
  })
})

describe('suggestOversubscriptionFixes', () => {
  it('ranks reducing the largest bucket first', () => {
    const buckets = [
      bucket({ id: 'small', per_paycheck: 50 }),
      bucket({ id: 'large', per_paycheck: 200 }),
    ]
    const suggestions = suggestOversubscriptionFixes(75, buckets, [])
    expect(suggestions[0]).toEqual({
      type: 'reduce_bucket',
      bucketId: 'large',
      bucketName: 'Emergency Fund',
      reduceBy: 75,
      newPerPaycheck: 125,
    })
  })

  it('suggests moving the smallest flexible bill that fully clears the overage', () => {
    const suggestions = suggestOversubscriptionFixes(
      80,
      [],
      [
        { id: 'i1', billName: 'Streaming', amount: 15 },
        { id: 'i2', billName: 'Car insurance', amount: 90 },
        { id: 'i3', billName: 'Utilities', amount: 150 },
      ],
    )
    expect(suggestions).toContainEqual({
      type: 'move_bill',
      instanceId: 'i2',
      billName: 'Car insurance',
      amount: 90,
    })
  })
})
