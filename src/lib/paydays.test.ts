import { describe, it, expect } from 'vitest'
import { generatePayDates, occurrencesForRule } from './paydays'
import { toISODate } from './localDate'
import type { IncomeSource } from '@/types/payday'
import type { DueRule } from '@/types/bills'

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

describe('generatePayDates', () => {
  it('generates biweekly pay dates across a month boundary from a real anchor', () => {
    const src = source({ schedule: 'biweekly', anchor_date: '2026-07-03' })
    const dates = generatePayDates(src, new Date(2026, 6, 1), new Date(2026, 7, 31))
    const iso = dates.map((d) => toISODate(d))
    expect(iso).toEqual(['2026-07-03', '2026-07-17', '2026-07-31', '2026-08-14', '2026-08-28'])
  })

  it('generates weekly pay dates from anchor', () => {
    const src = source({ schedule: 'weekly', anchor_date: '2026-07-03' })
    const dates = generatePayDates(src, new Date(2026, 6, 1), new Date(2026, 6, 24))
    expect(dates.map((d) => d.getDate())).toEqual([3, 10, 17, 24])
  })

  it('generates semimonthly {1,15} pay dates', () => {
    const src = source({ schedule: 'semimonthly', semimonthly_days: [1, 15] })
    const dates = generatePayDates(src, new Date(2026, 6, 1), new Date(2026, 7, 31))
    const iso = dates.map((d) => toISODate(d))
    expect(iso).toEqual(['2026-07-01', '2026-07-15', '2026-08-01', '2026-08-15'])
  })

  it('generates semimonthly {15,31} clamped, including February', () => {
    const src = source({ schedule: 'semimonthly', semimonthly_days: [15, 31] })
    const dates = generatePayDates(src, new Date(2026, 0, 1), new Date(2026, 1, 28))
    const iso = dates.map((d) => toISODate(d))
    expect(iso).toEqual(['2026-01-15', '2026-01-31', '2026-02-15', '2026-02-28'])
  })

  it('clamps monthly_day 31 to the last day of shorter months', () => {
    const src = source({ schedule: 'monthly', monthly_day: 31 })
    const dates = generatePayDates(src, new Date(2026, 1, 1), new Date(2026, 3, 30))
    const iso = dates.map((d) => toISODate(d))
    expect(iso).toEqual(['2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('returns an empty array for irregular schedules', () => {
    const src = source({ schedule: 'irregular' })
    expect(generatePayDates(src, new Date(2026, 0, 1), new Date(2026, 11, 31))).toEqual([])
  })

  it('returns an empty array when required fields are missing', () => {
    expect(generatePayDates(source({ schedule: 'biweekly', anchor_date: null }), new Date(2026, 0, 1), new Date(2026, 11, 31))).toEqual([])
    expect(generatePayDates(source({ schedule: 'semimonthly', semimonthly_days: null }), new Date(2026, 0, 1), new Date(2026, 11, 31))).toEqual([])
    expect(generatePayDates(source({ schedule: 'monthly', monthly_day: null }), new Date(2026, 0, 1), new Date(2026, 11, 31))).toEqual([])
  })
})

describe('occurrencesForRule', () => {
  it('walks all monthly due dates within the window', () => {
    const rule: DueRule = { type: 'monthly_day', day: 5 }
    const dates = occurrencesForRule(rule, new Date(2026, 0, 1), new Date(2026, 3, 30))
    expect(dates.map((d) => toISODate(d))).toEqual([
      '2026-01-05',
      '2026-02-05',
      '2026-03-05',
      '2026-04-05',
    ])
  })

  it('stops walking a one_off rule after its single occurrence', () => {
    const rule: DueRule = { type: 'one_off', date: '2026-03-15' }
    const dates = occurrencesForRule(rule, new Date(2026, 0, 1), new Date(2026, 11, 31))
    expect(dates).toHaveLength(1)
    expect(toISODate(dates[0])).toBe('2026-03-15')
  })

  it('returns nothing when the window is entirely before the next occurrence', () => {
    const rule: DueRule = { type: 'one_off', date: '2027-01-01' }
    expect(occurrencesForRule(rule, new Date(2026, 0, 1), new Date(2026, 11, 31))).toEqual([])
  })

  it('is capped and terminates for a fine-grained interval over a huge window', () => {
    const rule: DueRule = { type: 'interval_weeks', weeks: 1, anchor: '2020-01-01' }
    const dates = occurrencesForRule(rule, new Date(2020, 0, 1), new Date(2030, 0, 1))
    expect(dates.length).toBeLessThanOrEqual(100)
  })
})
