import { describe, it, expect } from 'vitest'
import { bucketProgressPercent, evaluateTargetPace, suggestPerPaycheck } from './bucketMath'

describe('bucketProgressPercent', () => {
  it('returns null when there is no target', () => {
    expect(bucketProgressPercent(500, null)).toBeNull()
  })

  it('returns null when target is zero or negative', () => {
    expect(bucketProgressPercent(500, 0)).toBeNull()
    expect(bucketProgressPercent(500, -100)).toBeNull()
  })

  it('computes percent of target', () => {
    expect(bucketProgressPercent(250, 1000)).toBe(25)
  })

  it('clamps to 100 when balance exceeds target', () => {
    expect(bucketProgressPercent(1500, 1000)).toBe(100)
  })

  it('clamps to 0 when balance is negative', () => {
    expect(bucketProgressPercent(-50, 1000)).toBe(0)
  })
})

describe('evaluateTargetPace', () => {
  it('reports funded when balance already meets target', () => {
    expect(evaluateTargetPace(1000, 1000, 100, 5)).toEqual({ status: 'funded', gap: 0 })
    expect(evaluateTargetPace(1200, 1000, 100, 5)).toEqual({ status: 'funded', gap: 0 })
  })

  it('reports on_track when projected contributions close the gap', () => {
    const result = evaluateTargetPace(500, 1000, 100, 5)
    expect(result.status).toBe('on_track')
    expect(result.gap).toBe(500)
  })

  it('reports behind when projected contributions fall short', () => {
    const result = evaluateTargetPace(500, 1000, 50, 5)
    expect(result.status).toBe('behind')
    expect(result.gap).toBe(500)
  })
})

describe('suggestPerPaycheck', () => {
  const today = new Date(2026, 6, 23) // Jul 23, 2026

  it('splits the remaining amount across paychecks in the window', () => {
    const result = suggestPerPaycheck({
      targetAmount: 1000,
      targetDate: '2026-09-01',
      currentBalance: 0,
      payDates: ['2026-07-31', '2026-08-15', '2026-08-31', '2026-09-01'],
      today,
    })
    expect(result).toBe(250)
  })

  it('reduces the suggestion when there is an existing balance', () => {
    const result = suggestPerPaycheck({
      targetAmount: 1000,
      targetDate: '2026-09-01',
      currentBalance: 200,
      payDates: ['2026-07-31', '2026-08-15', '2026-08-31', '2026-09-01'],
      today,
    })
    expect(result).toBe(200)
  })

  it('returns null when the target date is in the past', () => {
    const result = suggestPerPaycheck({
      targetAmount: 1000,
      targetDate: '2020-01-01',
      currentBalance: 0,
      payDates: ['2026-08-01'],
      today,
    })
    expect(result).toBeNull()
  })

  it('returns null when no paychecks fall in the window', () => {
    const result = suggestPerPaycheck({
      targetAmount: 1000,
      targetDate: '2026-09-01',
      currentBalance: 0,
      payDates: [],
      today,
    })
    expect(result).toBeNull()
  })

  it('rounds up to the cent so the goal is never missed by pennies', () => {
    const result = suggestPerPaycheck({
      targetAmount: 100,
      targetDate: '2026-09-01',
      currentBalance: 0,
      payDates: ['2026-07-31', '2026-08-15', '2026-08-31'],
      today,
    })
    // 100 / 3 = 33.333... -> rounds up to 33.34
    expect(result).toBe(33.34)
  })

  it('returns null when target amount or target date is missing', () => {
    expect(
      suggestPerPaycheck({
        targetAmount: null,
        targetDate: '2026-09-01',
        currentBalance: 0,
        payDates: [],
        today,
      }),
    ).toBeNull()
    expect(
      suggestPerPaycheck({
        targetAmount: 1000,
        targetDate: null,
        currentBalance: 0,
        payDates: [],
        today,
      }),
    ).toBeNull()
  })

  it('excludes a paycheck landing exactly today', () => {
    const result = suggestPerPaycheck({
      targetAmount: 1000,
      targetDate: '2026-09-01',
      currentBalance: 0,
      payDates: ['2026-07-23', '2026-08-15', '2026-08-31', '2026-09-01'],
      today,
    })
    // today's date is excluded, leaving 3 paychecks -> 1000 / 3 = 333.33... -> 333.34
    expect(result).toBe(333.34)
  })
})
