import { describe, it, expect } from 'vitest'
import { nextDueDate, describeDueRule } from './dueRules'
import type { DueRule } from '@/types/bills'

describe('nextDueDate', () => {
  it('clamps day 31 to Feb 28 in a non-leap year', () => {
    const rule: DueRule = { type: 'monthly_day', day: 31 }
    const result = nextDueDate(rule, new Date(2026, 1, 1)) // Feb 1, 2026 (not a leap year)
    expect(result).toEqual(new Date(2026, 1, 28))
  })

  it('clamps day 31 to Feb 29 in a leap year', () => {
    const rule: DueRule = { type: 'monthly_day', day: 31 }
    const result = nextDueDate(rule, new Date(2028, 1, 1)) // Feb 1, 2028 (leap year)
    expect(result).toEqual(new Date(2028, 1, 29))
  })

  it('rolls monthly_day to next month when day has already passed', () => {
    const rule: DueRule = { type: 'monthly_day', day: 5 }
    const result = nextDueDate(rule, new Date(2026, 2, 10)) // Mar 10, 2026
    expect(result).toEqual(new Date(2026, 3, 5))
  })

  it('resolves last_day across months, including February', () => {
    const rule: DueRule = { type: 'last_day' }
    expect(nextDueDate(rule, new Date(2026, 1, 1))).toEqual(new Date(2026, 1, 28))
    expect(nextDueDate(rule, new Date(2028, 1, 1))).toEqual(new Date(2028, 1, 29))
    expect(nextDueDate(rule, new Date(2026, 3, 15))).toEqual(new Date(2026, 3, 30))
  })

  it('rolls last_day to next month when from is after the last day', () => {
    const rule: DueRule = { type: 'last_day' }
    const result = nextDueDate(rule, new Date(2026, 3, 30))
    expect(result).toEqual(new Date(2026, 3, 30))
  })

  it('computes interval_weeks rollover past from', () => {
    const rule: DueRule = { type: 'interval_weeks', weeks: 4, anchor: '2026-07-03' }
    const result = nextDueDate(rule, new Date(2026, 7, 1)) // Aug 1, 2026
    // anchor Jul 3, +4wk -> Jul 31, +4wk -> Aug 28
    expect(result).toEqual(new Date(2026, 7, 28))
  })

  it('returns the anchor itself when from is before or on the anchor', () => {
    const rule: DueRule = { type: 'interval_weeks', weeks: 2, anchor: '2026-07-03' }
    const result = nextDueDate(rule, new Date(2026, 6, 1)) // Jul 1, 2026
    expect(result).toEqual(new Date(2026, 6, 3))
  })

  it('returns the one_off date when it is on or after from', () => {
    const rule: DueRule = { type: 'one_off', date: '2026-08-01' }
    expect(nextDueDate(rule, new Date(2026, 6, 1))).toEqual(new Date(2026, 7, 1))
    expect(nextDueDate(rule, new Date(2026, 7, 1))).toEqual(new Date(2026, 7, 1))
  })

  it('returns null when a one_off date is in the past', () => {
    const rule: DueRule = { type: 'one_off', date: '2026-01-01' }
    expect(nextDueDate(rule, new Date(2026, 6, 1))).toBeNull()
  })
})

describe('describeDueRule', () => {
  it('describes monthly_day', () => {
    expect(describeDueRule({ type: 'monthly_day', day: 15 })).toBe('Monthly on the 15th')
    expect(describeDueRule({ type: 'monthly_day', day: 1 })).toBe('Monthly on the 1st')
    expect(describeDueRule({ type: 'monthly_day', day: 22 })).toBe('Monthly on the 22nd')
  })

  it('describes last_day', () => {
    expect(describeDueRule({ type: 'last_day' })).toBe('Last day of month')
  })

  it('describes interval_weeks', () => {
    expect(describeDueRule({ type: 'interval_weeks', weeks: 4, anchor: '2026-07-03' })).toBe(
      'Every 4 weeks (from Jul 3)',
    )
  })

  it('describes one_off', () => {
    expect(describeDueRule({ type: 'one_off', date: '2026-08-01' })).toBe('Once on Aug 1, 2026')
  })
})
