import { describe, it, expect } from 'vitest'
import { nextDueDate } from './dueRules'
import { generatePayDates, occurrencesForRule } from './paydays'
import { addDays, calendarDaysBetween, toISODate } from './localDate'
import { monthGridDates } from './calendar'
import { assignInstances } from './assignment'
import type { DueRule } from '@/types/bills'
import type { BillInstance, IncomeSource, Paycheck } from '@/types/payday'

// These tests depend on the zone pinned in vite.config.ts (test.env.TZ).
// 2026 in America/Denver: spring-forward Sun Mar 8, fall-back Sun Nov 1.

function source(overrides: Partial<IncomeSource>): IncomeSource {
  return {
    id: 'src-1',
    user_id: 'user-1',
    name: 'Test income',
    net_amount: 1000,
    schedule: 'biweekly',
    anchor_date: null,
    semimonthly_days: null,
    monthly_day: null,
    active: true,
    ...overrides,
  }
}

function iso(dates: Date[]): string[] {
  return dates.map(toISODate)
}

function expectAllLocalMidnight(dates: Date[]) {
  for (const d of dates) {
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0])
  }
}

describe('test time zone', () => {
  it('is pinned to America/Denver with DST in effect', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Denver')
    expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(360) // MDT
    expect(new Date(2026, 11, 1).getTimezoneOffset()).toBe(420) // MST
  })
})

describe('addDays', () => {
  it('steps over fall-back without repeating or skipping a day', () => {
    expect(addDays(new Date(2026, 9, 31), 1)).toEqual(new Date(2026, 10, 1))
    expect(addDays(new Date(2026, 10, 1), 1)).toEqual(new Date(2026, 10, 2))
    expect(addDays(new Date(2026, 9, 9), 42)).toEqual(new Date(2026, 10, 20))
    expect(addDays(new Date(2026, 10, 3), -3)).toEqual(new Date(2026, 9, 31))
  })

  it('steps over spring-forward without repeating or skipping a day', () => {
    expect(addDays(new Date(2026, 2, 7), 1)).toEqual(new Date(2026, 2, 8))
    expect(addDays(new Date(2026, 2, 8), 1)).toEqual(new Date(2026, 2, 9))
    expect(addDays(new Date(2026, 1, 27), 14)).toEqual(new Date(2026, 2, 13))
    expect(addDays(new Date(2026, 2, 10), -3)).toEqual(new Date(2026, 2, 7))
  })

  it('keeps the wall-clock time of day', () => {
    expect(addDays(new Date(2026, 9, 31, 0, 30), 1)).toEqual(new Date(2026, 10, 1, 0, 30))
    expect(addDays(new Date(2026, 2, 7, 23, 30), 1)).toEqual(new Date(2026, 2, 8, 23, 30))
    expect(addDays(new Date(2026, 6, 3, 14, 5, 6, 7), 10)).toEqual(new Date(2026, 6, 13, 14, 5, 6, 7))
  })

  it('rolls over month and year ends', () => {
    expect(addDays(new Date(2026, 11, 31), 1)).toEqual(new Date(2027, 0, 1))
    expect(addDays(new Date(2026, 2, 1), -1)).toEqual(new Date(2026, 1, 28))
  })
})

describe('calendarDaysBetween', () => {
  it('counts whole calendar days across both DST changes', () => {
    expect(calendarDaysBetween(new Date(2026, 9, 9), new Date(2026, 10, 20))).toBe(42)
    expect(calendarDaysBetween(new Date(2026, 1, 27), new Date(2026, 2, 13))).toBe(14)
    expect(calendarDaysBetween(new Date(2026, 10, 20), new Date(2026, 9, 9))).toBe(-42)
    expect(calendarDaysBetween(new Date(2026, 10, 1), new Date(2026, 10, 1))).toBe(0)
  })

  it('ignores time of day', () => {
    expect(calendarDaysBetween(new Date(2026, 9, 31, 23, 59), new Date(2026, 10, 1, 0, 1))).toBe(1)
  })
})

describe('interval_weeks across DST', () => {
  it('PP.7.3 repro: anchor 2026-10-09 every 2 weeks, 90 days from mid-November', () => {
    const rule: DueRule = { type: 'interval_weeks', weeks: 2, anchor: '2026-10-09' }
    const from = new Date(2026, 10, 15)
    const dates = occurrencesForRule(rule, from, addDays(from, 90))
    expect(iso(dates)).toEqual([
      '2026-11-20',
      '2026-12-04',
      '2026-12-18',
      '2027-01-01',
      '2027-01-15',
      '2027-01-29',
      '2027-02-12',
    ])
    expectAllLocalMidnight(dates)
  })

  it('nextDueDate lands on local midnight when the anchor is on the other side of fall-back', () => {
    const rule: DueRule = { type: 'interval_weeks', weeks: 2, anchor: '2026-10-09' }
    expect(nextDueDate(rule, new Date(2026, 10, 15))).toEqual(new Date(2026, 10, 20))
    // from exactly on an occurrence returns that occurrence
    expect(nextDueDate(rule, new Date(2026, 10, 20))).toEqual(new Date(2026, 10, 20))
    expect(nextDueDate(rule, new Date(2026, 10, 21))).toEqual(new Date(2026, 11, 4))
    // occurrence on the fall-back day itself
    const weekly: DueRule = { type: 'interval_weeks', weeks: 1, anchor: '2026-10-25' }
    expect(nextDueDate(weekly, new Date(2026, 9, 26))).toEqual(new Date(2026, 10, 1))
    expect(nextDueDate(weekly, new Date(2026, 10, 2))).toEqual(new Date(2026, 10, 8))
  })

  it('nextDueDate lands on local midnight when the anchor is on the other side of spring-forward', () => {
    const rule: DueRule = { type: 'interval_weeks', weeks: 2, anchor: '2026-02-27' }
    expect(nextDueDate(rule, new Date(2026, 2, 9))).toEqual(new Date(2026, 2, 13))
    expect(nextDueDate(rule, new Date(2026, 2, 13))).toEqual(new Date(2026, 2, 13))
    expect(nextDueDate(rule, new Date(2026, 2, 14))).toEqual(new Date(2026, 2, 27))
    // occurrence on the spring-forward day itself
    const weekly: DueRule = { type: 'interval_weeks', weeks: 1, anchor: '2026-03-01' }
    expect(nextDueDate(weekly, new Date(2026, 2, 2))).toEqual(new Date(2026, 2, 8))
    expect(nextDueDate(weekly, new Date(2026, 2, 9))).toEqual(new Date(2026, 2, 15))
  })

  it('walks a window that spans fall-back', () => {
    const rule: DueRule = { type: 'interval_weeks', weeks: 2, anchor: '2026-10-09' }
    const dates = occurrencesForRule(rule, new Date(2026, 9, 1), new Date(2026, 11, 18))
    expect(iso(dates)).toEqual([
      '2026-10-09',
      '2026-10-23',
      '2026-11-06',
      '2026-11-20',
      '2026-12-04',
      '2026-12-18',
    ])
    expectAllLocalMidnight(dates)
  })

  it('walks a window that spans spring-forward, including an occurrence on the last day', () => {
    const rule: DueRule = { type: 'interval_weeks', weeks: 1, anchor: '2026-02-20' }
    const dates = occurrencesForRule(rule, new Date(2026, 1, 15), new Date(2026, 2, 27))
    expect(iso(dates)).toEqual([
      '2026-02-20',
      '2026-02-27',
      '2026-03-06',
      '2026-03-13',
      '2026-03-20',
      '2026-03-27',
    ])
    expectAllLocalMidnight(dates)
  })
})

describe('weekly/biweekly paychecks across DST', () => {
  it('biweekly spanning fall-back', () => {
    const src = source({ schedule: 'biweekly', anchor_date: '2026-10-09' })
    const dates = generatePayDates(src, new Date(2026, 9, 1), new Date(2026, 11, 18))
    expect(iso(dates)).toEqual([
      '2026-10-09',
      '2026-10-23',
      '2026-11-06',
      '2026-11-20',
      '2026-12-04',
      '2026-12-18',
    ])
    expectAllLocalMidnight(dates)
  })

  it('biweekly with the anchor before fall-back and the window after it', () => {
    const src = source({ schedule: 'biweekly', anchor_date: '2026-10-09' })
    const from = new Date(2026, 10, 15)
    const dates = generatePayDates(src, from, addDays(from, 90))
    expect(iso(dates)).toEqual([
      '2026-11-20',
      '2026-12-04',
      '2026-12-18',
      '2027-01-01',
      '2027-01-15',
      '2027-01-29',
      '2027-02-12',
    ])
    expectAllLocalMidnight(dates)
  })

  it('biweekly spanning spring-forward, including a payday on the last day of the window', () => {
    const src = source({ schedule: 'biweekly', anchor_date: '2026-02-13' })
    const dates = generatePayDates(src, new Date(2026, 1, 1), new Date(2026, 2, 27))
    expect(iso(dates)).toEqual(['2026-02-13', '2026-02-27', '2026-03-13', '2026-03-27'])
    expectAllLocalMidnight(dates)
  })

  it('biweekly with the anchor before spring-forward and the window starting on a payday after it', () => {
    const src = source({ schedule: 'biweekly', anchor_date: '2026-02-13' })
    const dates = generatePayDates(src, new Date(2026, 2, 13), new Date(2026, 3, 10))
    expect(iso(dates)).toEqual(['2026-03-13', '2026-03-27', '2026-04-10'])
    expectAllLocalMidnight(dates)
  })

  it('weekly spanning both boundaries, with paydays on the changeover Sundays', () => {
    const fall = generatePayDates(
      source({ schedule: 'weekly', anchor_date: '2026-10-18' }),
      new Date(2026, 9, 18),
      new Date(2026, 10, 15),
    )
    expect(iso(fall)).toEqual(['2026-10-18', '2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15'])
    expectAllLocalMidnight(fall)

    const spring = generatePayDates(
      source({ schedule: 'weekly', anchor_date: '2026-02-22' }),
      new Date(2026, 1, 22),
      new Date(2026, 2, 22),
    )
    expect(iso(spring)).toEqual(['2026-02-22', '2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22'])
    expectAllLocalMidnight(spring)
  })
})

describe('monthly_day / last_day near DST boundaries', () => {
  it('nextDueDate for monthly_day is unchanged around fall-back', () => {
    const first: DueRule = { type: 'monthly_day', day: 1 }
    expect(nextDueDate(first, new Date(2026, 9, 20))).toEqual(new Date(2026, 10, 1))
    expect(nextDueDate(first, new Date(2026, 10, 1))).toEqual(new Date(2026, 10, 1))
    expect(nextDueDate(first, new Date(2026, 10, 2))).toEqual(new Date(2026, 11, 1))
    const second: DueRule = { type: 'monthly_day', day: 2 }
    expect(nextDueDate(second, new Date(2026, 10, 1))).toEqual(new Date(2026, 10, 2))
  })

  it('nextDueDate for monthly_day is unchanged around spring-forward', () => {
    const eighth: DueRule = { type: 'monthly_day', day: 8 }
    expect(nextDueDate(eighth, new Date(2026, 2, 1))).toEqual(new Date(2026, 2, 8))
    expect(nextDueDate(eighth, new Date(2026, 2, 8))).toEqual(new Date(2026, 2, 8))
    expect(nextDueDate(eighth, new Date(2026, 2, 9))).toEqual(new Date(2026, 3, 8))
    const ninth: DueRule = { type: 'monthly_day', day: 9 }
    expect(nextDueDate(ninth, new Date(2026, 2, 8))).toEqual(new Date(2026, 2, 9))
  })

  it('nextDueDate for last_day is unchanged around both boundaries', () => {
    const rule: DueRule = { type: 'last_day' }
    expect(nextDueDate(rule, new Date(2026, 9, 25))).toEqual(new Date(2026, 9, 31))
    expect(nextDueDate(rule, new Date(2026, 9, 31))).toEqual(new Date(2026, 9, 31))
    expect(nextDueDate(rule, new Date(2026, 10, 1))).toEqual(new Date(2026, 10, 30))
    expect(nextDueDate(rule, new Date(2026, 2, 8))).toEqual(new Date(2026, 2, 31))
    expect(nextDueDate(rule, new Date(2026, 1, 28))).toEqual(new Date(2026, 1, 28))
  })

  it('walks monthly_day occurrences once each, including one on the fall-back day', () => {
    const rule: DueRule = { type: 'monthly_day', day: 1 }
    const dates = occurrencesForRule(rule, new Date(2026, 9, 1), new Date(2026, 11, 31))
    expect(iso(dates)).toEqual(['2026-10-01', '2026-11-01', '2026-12-01'])
    expectAllLocalMidnight(dates)
  })

  it('walks monthly_day occurrences once each, including one on the spring-forward day', () => {
    const rule: DueRule = { type: 'monthly_day', day: 8 }
    const dates = occurrencesForRule(rule, new Date(2026, 1, 1), new Date(2026, 3, 30))
    expect(iso(dates)).toEqual(['2026-02-08', '2026-03-08', '2026-04-08'])
    expectAllLocalMidnight(dates)
  })

  it('walks last_day occurrences across both boundaries', () => {
    const rule: DueRule = { type: 'last_day' }
    expect(iso(occurrencesForRule(rule, new Date(2026, 9, 1), new Date(2026, 11, 31)))).toEqual([
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
    ])
    expect(iso(occurrencesForRule(rule, new Date(2026, 1, 1), new Date(2026, 3, 30)))).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('walks a one_off on the fall-back day exactly once', () => {
    const rule: DueRule = { type: 'one_off', date: '2026-11-01' }
    const dates = occurrencesForRule(rule, new Date(2026, 9, 1), new Date(2026, 11, 31))
    expect(iso(dates)).toEqual(['2026-11-01'])
  })
})

describe('other addDays callers across DST', () => {
  function expectConsecutiveDays(grid: Date[], firstISO: string, lastISO: string) {
    expect(grid.length % 7).toBe(0)
    expect(toISODate(grid[0])).toBe(firstISO)
    expect(toISODate(grid[grid.length - 1])).toBe(lastISO)
    expect(new Set(iso(grid)).size).toBe(grid.length)
    expectAllLocalMidnight(grid)
    for (let i = 1; i < grid.length; i++) {
      expect(calendarDaysBetween(grid[i - 1], grid[i])).toBe(1)
    }
  }

  it('month grid for November 2026 has each day once', () => {
    // Nov 1 is a Sunday (and the fall-back day); Nov 30 is a Monday.
    expectConsecutiveDays(monthGridDates(2026, 10), '2026-11-01', '2026-12-05')
    expect(monthGridDates(2026, 10)).toHaveLength(35)
  })

  it('month grid for March 2026 has each day once', () => {
    // Mar 1 is a Sunday; Mar 31 is a Tuesday.
    expectConsecutiveDays(monthGridDates(2026, 2), '2026-03-01', '2026-04-04')
    expect(monthGridDates(2026, 2)).toHaveLength(35)
  })

  it('buffer window still accepts a payday exactly bufferDays before a due date past spring-forward', () => {
    const pc: Paycheck = {
      id: 'pc-a',
      user_id: 'user-1',
      income_source_id: 'src-1',
      pay_date: '2026-03-07',
      expected_amount: 1000,
      actual_amount: null,
    }
    const bi: BillInstance = {
      id: 'bi-a',
      user_id: 'user-1',
      bill_id: 'bill-1',
      due_date: '2026-03-10',
      amount: 100,
      paycheck_id: null,
      override: false,
      status: 'planned',
      paid_at: null,
      paid_source: null,
      autopay_hold: false,
    }
    expect(assignInstances([bi], [pc], 3).get('bi-a')).toEqual({ paycheckId: 'pc-a', alert: 'none' })
  })

  it('buffer window across fall-back', () => {
    const pc: Paycheck = {
      id: 'pc-a',
      user_id: 'user-1',
      income_source_id: 'src-1',
      pay_date: '2026-10-31',
      expected_amount: 1000,
      actual_amount: null,
    }
    const base: BillInstance = {
      id: 'bi-a',
      user_id: 'user-1',
      bill_id: 'bill-1',
      due_date: '2026-11-03',
      amount: 100,
      paycheck_id: null,
      override: false,
      status: 'planned',
      paid_at: null,
      paid_source: null,
      autopay_hold: false,
    }
    expect(assignInstances([base], [pc], 3).get('bi-a')).toEqual({ paycheckId: 'pc-a', alert: 'none' })
    const tooSoon = { ...base, id: 'bi-b', due_date: '2026-11-02' }
    expect(assignInstances([tooSoon], [pc], 3).get('bi-b')).toEqual({
      paycheckId: 'pc-a',
      alert: 'due_before_payday',
    })
  })
})
