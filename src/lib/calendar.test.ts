import { describe, it, expect } from 'vitest'
import { monthGridDates, buildCalendarDays } from './calendar'
import { toISODate } from './localDate'
import type { IncomeSource } from '@/types/payday'
import type { Bill } from '@/types/bills'

function source(overrides: Partial<IncomeSource>): IncomeSource {
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
    due_rule: { type: 'monthly_day', day: 5 },
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

describe('monthGridDates', () => {
  it('returns complete weeks starting on Sunday and ending on Saturday', () => {
    const grid = monthGridDates(2026, 6) // July 2026
    expect(grid.length % 7).toBe(0)
    expect(grid[0].getDay()).toBe(0)
    expect(grid[grid.length - 1].getDay()).toBe(6)
  })

  it('spans into the previous and next month to fill the grid', () => {
    const grid = monthGridDates(2026, 6) // July 2026: starts Wed, ends Fri
    expect(toISODate(grid[0])).toBe('2026-06-28')
    expect(toISODate(grid[grid.length - 1])).toBe('2026-08-01')
    expect(grid).toHaveLength(35)
  })

  it('does not spill into adjacent months when the month starts and ends on grid boundaries', () => {
    const grid = monthGridDates(2026, 1) // Feb 2026: starts Sun, ends Sat, 28 days
    expect(grid).toHaveLength(28)
    expect(toISODate(grid[0])).toBe('2026-02-01')
    expect(toISODate(grid[grid.length - 1])).toBe('2026-02-28')
  })

  it('includes every day of the target month exactly once', () => {
    const grid = monthGridDates(2026, 6)
    const julyDays = grid.filter((d) => d.getMonth() === 6 && d.getFullYear() === 2026)
    expect(julyDays.map((d) => d.getDate())).toEqual(Array.from({ length: 31 }, (_, i) => i + 1))
  })
})

describe('buildCalendarDays', () => {
  const from = new Date(2026, 6, 1) // Jul 1, 2026
  const to = new Date(2026, 6, 31) // Jul 31, 2026

  it('projects a computed payday from an income schedule when no real paycheck exists', () => {
    const days = buildCalendarDays({
      incomeSources: [source({})],
      bills: [],
      realPaychecks: [],
      realInstances: [],
      from,
      to,
    })
    expect(days.get('2026-07-03')?.paydays).toEqual([
      { date: '2026-07-03', real: false, sourceId: 'src-1', sourceName: 'Main job', amount: 1000, paycheckId: null },
    ])
  })

  it('prefers the real paycheck over the computed occurrence for the same source and date', () => {
    const days = buildCalendarDays({
      incomeSources: [source({})],
      bills: [],
      realPaychecks: [
        { id: 'pc-1', income_source_id: 'src-1', pay_date: '2026-07-03', expected_amount: 1050, sourceName: 'Main job' },
      ],
      realInstances: [],
      from,
      to,
    })
    expect(days.get('2026-07-03')?.paydays).toEqual([
      { date: '2026-07-03', real: true, sourceId: 'src-1', sourceName: 'Main job', amount: 1050, paycheckId: 'pc-1' },
    ])
  })

  it('does not project paydays for an inactive income source', () => {
    const days = buildCalendarDays({
      incomeSources: [source({ active: false })],
      bills: [],
      realPaychecks: [],
      realInstances: [],
      from,
      to,
    })
    expect(days.size).toBe(0)
  })

  it('projects a computed bill occurrence from a due rule when no real instance exists', () => {
    const days = buildCalendarDays({
      incomeSources: [],
      bills: [bill({})],
      realPaychecks: [],
      realInstances: [],
      from,
      to,
    })
    expect(days.get('2026-07-05')?.bills).toEqual([
      {
        date: '2026-07-05',
        real: false,
        billId: 'bill-1',
        billName: 'Rent',
        amount: 1000,
        amountType: 'fixed',
        dueRuleLabel: 'Monthly on the 5th',
        status: null,
        instanceId: null,
        paycheckId: null,
      },
    ])
  })

  it('prefers the real bill instance over the computed occurrence, carrying status and assignment', () => {
    const days = buildCalendarDays({
      incomeSources: [],
      bills: [bill({})],
      realPaychecks: [],
      realInstances: [
        { id: 'bi-1', bill_id: 'bill-1', due_date: '2026-07-05', amount: 1000, status: 'paid', paycheck_id: 'pc-1' },
      ],
      from,
      to,
    })
    expect(days.get('2026-07-05')?.bills).toEqual([
      {
        date: '2026-07-05',
        real: true,
        billId: 'bill-1',
        billName: 'Rent',
        amount: 1000,
        amountType: 'fixed',
        dueRuleLabel: 'Monthly on the 5th',
        status: 'paid',
        instanceId: 'bi-1',
        paycheckId: 'pc-1',
      },
    ])
  })

  it('still shows a real instance for a since-deactivated bill without projecting further occurrences', () => {
    const days = buildCalendarDays({
      incomeSources: [],
      bills: [bill({ active: false })],
      realPaychecks: [],
      realInstances: [
        { id: 'bi-1', bill_id: 'bill-1', due_date: '2026-07-05', amount: 1000, status: 'planned', paycheck_id: null },
      ],
      from,
      to: new Date(2026, 7, 31), // through August — would project a 2nd occurrence if still active
    })
    expect(days.get('2026-07-05')?.bills).toHaveLength(1)
    expect(days.get('2026-08-05')).toBeUndefined()
  })

  it('excludes real rows outside the requested range', () => {
    const days = buildCalendarDays({
      incomeSources: [],
      bills: [],
      realPaychecks: [
        { id: 'pc-old', income_source_id: 'src-1', pay_date: '2026-06-19', expected_amount: 1000, sourceName: 'Main job' },
      ],
      realInstances: [],
      from,
      to,
    })
    expect(days.get('2026-06-19')).toBeUndefined()
  })

  it('sorts real entries before computed entries within the same day', () => {
    const days = buildCalendarDays({
      incomeSources: [
        source({}),
        source({ id: 'src-2', name: 'Side gig', schedule: 'monthly', monthly_day: 3, anchor_date: null }),
      ],
      bills: [],
      realPaychecks: [
        { id: 'pc-1', income_source_id: 'src-1', pay_date: '2026-07-03', expected_amount: 1000, sourceName: 'Main job' },
      ],
      realInstances: [],
      from,
      to,
    })
    const day = days.get('2026-07-03')
    expect(day?.paydays.map((p) => ({ sourceId: p.sourceId, real: p.real }))).toEqual([
      { sourceId: 'src-1', real: true },
      { sourceId: 'src-2', real: false },
    ])
  })
})
