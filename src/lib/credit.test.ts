import { describe, it, expect } from 'vitest'
import {
  payoffMonths,
  minimumPaymentSchedule,
  whatIfPayment,
  utilizationTargets,
  interestPrincipalSplit,
} from './credit'

describe('payoffMonths', () => {
  it('handles a zero-APR loan as exact division', () => {
    expect(payoffMonths(500, 0, 125)).toEqual({ kind: 'paid_off', months: 4, totalInterest: 0 })
  })

  it('caps the final payment at the remaining balance on a zero-APR loan', () => {
    // 500 / 150 -> 3 full months of 150, then a final 50 payment
    expect(payoffMonths(500, 0, 150)).toEqual({ kind: 'paid_off', months: 4, totalInterest: 0 })
  })

  it('amortizes a balance with APR (known-answer, hand-verified)', () => {
    // balance 200 @ 24% APR (2%/mo), $90/mo
    // m1: interest 4.00, principal 86.00 -> remaining 114.00, cum interest 4.00
    // m2: interest 2.28, principal 87.72 -> remaining 26.28, cum interest 6.28
    // m3: interest 0.5256, final payment clears remaining -> cum interest 6.8056 -> 6.81
    const result = payoffMonths(200, 24, 90)
    expect(result.kind).toBe('paid_off')
    expect(result.months).toBe(3)
    expect(result.totalInterest).toBeCloseTo(6.81, 2)
  })

  it('detects a payment that never outpaces interest', () => {
    // 24% APR on 1000 = $20/mo interest; a $15 payment can never win
    expect(payoffMonths(1000, 24, 15)).toEqual({ kind: 'never_pays_off', months: null, totalInterest: null })
  })

  it('treats an already-zero balance as instantly paid off', () => {
    expect(payoffMonths(0, 24, 100)).toEqual({ kind: 'paid_off', months: 0, totalInterest: 0 })
  })

  it('reports exceeds_horizon (not never_pays_off) when payment outpaces interest but payoff takes over 1200 months', () => {
    // 0% APR, so payment (1) always outpaces interest (0) — this is not a never-pays-off case.
    // 2000 / 1/mo would take 2000 months, well past the 1200-month cap.
    expect(payoffMonths(2000, 0, 1)).toEqual({ kind: 'exceeds_horizon', months: null, totalInterest: null })
  })
})

describe('minimumPaymentSchedule', () => {
  it('handles a zero-APR declining minimum driven by percent-of-balance', () => {
    // 100 @ 0% APR, greater of $25 floor or 50% of balance
    // m1: payment max(25,50)=50 -> remaining 50
    // m2: payment max(25,25)=25 -> remaining 25
    // m3: payment max(25,12.5)=25 -> remaining 0
    expect(minimumPaymentSchedule(100, 0, 50, 25)).toEqual({
      kind: 'paid_off',
      months: 3,
      totalInterest: 0,
    })
  })

  it('handles a zero-APR declining minimum driven by the flat floor', () => {
    // 100 @ 0% APR, greater of $30 floor or 1% of balance -> floor dominates throughout
    expect(minimumPaymentSchedule(100, 0, 1, 30)).toEqual({
      kind: 'paid_off',
      months: 4,
      totalInterest: 0,
    })
  })

  it('detects a minimum that never outpaces interest', () => {
    // 24% APR on 1000 = $20/mo interest; min(1% of 1000, $10 floor) = $10 never wins
    expect(minimumPaymentSchedule(1000, 24, 1, 10)).toEqual({
      kind: 'never_pays_off',
      months: null,
      totalInterest: null,
    })
  })

  it('treats an already-zero balance as instantly paid off', () => {
    expect(minimumPaymentSchedule(0, 24, 2, 25)).toEqual({ kind: 'paid_off', months: 0, totalInterest: 0 })
  })

  it('reports exceeds_horizon (not never_pays_off) when the minimum outpaces interest but payoff takes over 1200 months', () => {
    // 0% APR, floor of $1 dominates (0% of any balance is 0) — payment always outpaces the $0 interest.
    // 2000 / 1/mo would take 2000 months, well past the 1200-month cap.
    expect(minimumPaymentSchedule(2000, 0, 0, 1)).toEqual({
      kind: 'exceeds_horizon',
      months: null,
      totalInterest: null,
    })
  })
})

describe('whatIfPayment', () => {
  it('computes months and interest saved on a zero-APR loan', () => {
    const result = whatIfPayment(500, 0, 100, 25)
    expect(result).toEqual({
      baseNeverPaysOff: false,
      newNeverPaysOff: false,
      monthsSaved: 1,
      interestSaved: 0,
    })
  })

  it('computes months and interest saved with APR (known-answer, hand-verified)', () => {
    // base: 200 @ 24% APR, $90/mo -> 3 months, $6.81 interest (see payoffMonths test)
    // with extra: 200 @ 24% APR, $110/mo -> 2 months, $5.88 interest
    const result = whatIfPayment(200, 24, 90, 20)
    expect(result.baseNeverPaysOff).toBe(false)
    expect(result.newNeverPaysOff).toBe(false)
    expect(result.monthsSaved).toBe(1)
    expect(result.interestSaved).toBeCloseTo(0.93, 2)
  })

  it('reports null savings when the base payment never pays off', () => {
    const result = whatIfPayment(1000, 24, 15, 20)
    expect(result.baseNeverPaysOff).toBe(true)
    expect(result.monthsSaved).toBeNull()
    expect(result.interestSaved).toBeNull()
  })

  it('reports null savings when the base payment exceeds the payoff horizon', () => {
    // 0% APR, $1/mo on a $2000 balance -> exceeds_horizon, not never_pays_off, but still not
    // cleanly comparable, so whatIf should still report null savings.
    const result = whatIfPayment(2000, 0, 1, 5)
    expect(result.baseNeverPaysOff).toBe(true)
    expect(result.monthsSaved).toBeNull()
    expect(result.interestSaved).toBeNull()
  })
})

describe('utilizationTargets', () => {
  it('computes current percent and dollars to each threshold', () => {
    expect(utilizationTargets(500, 1000)).toEqual({
      currentPercent: 50,
      dollarsTo30: 200,
      dollarsTo10: 400,
    })
  })

  it('returns zero dollars-to-target once balance is already below the threshold', () => {
    expect(utilizationTargets(200, 1000)).toEqual({
      currentPercent: 20,
      dollarsTo30: 0,
      dollarsTo10: 100,
    })
  })

  it('returns zero for both targets when balance is already below 10%', () => {
    expect(utilizationTargets(50, 1000)).toEqual({
      currentPercent: 5,
      dollarsTo30: 0,
      dollarsTo10: 0,
    })
  })

  it('returns null for a zero or missing limit', () => {
    expect(utilizationTargets(500, 0)).toBeNull()
  })

  it('rounds a fractional-cent gap up to a full cent instead of showing $0.00', () => {
    // 0.3 * 10000 = 3000; balance 3000.001 leaves a gap of $0.001 (a tenth of a cent).
    // Math.round would show $0.00 for a nonzero gap; ceiling must show $0.01.
    const result = utilizationTargets(3000.001, 10000)
    expect(result!.dollarsTo30).toBe(0.01)
  })

  it('rounds a required payment up to the cent so paying the shown amount reaches the target', () => {
    // 0.1 * 1000 = 100; gap of 750.004 rounds down to 750.00 under nearest-cent rounding,
    // which would leave the balance 0.4 cents above the 10% target after paying the shown amount.
    const balance = 850.004
    const target = 1000 * 0.1
    const result = utilizationTargets(balance, 1000)
    expect(result!.dollarsTo10).toBe(750.01)
    expect(balance - result!.dollarsTo10).toBeLessThanOrEqual(target)
  })
})

describe('interestPrincipalSplit', () => {
  it('splits a zero-APR payment as all principal', () => {
    expect(interestPrincipalSplit(500, 0, 100)).toEqual({ interest: 0, principal: 100 })
  })

  it('splits an APR-bearing payment into interest and principal', () => {
    expect(interestPrincipalSplit(1000, 24, 50)).toEqual({ interest: 20, principal: 30 })
  })

  it('reports negative principal when the payment does not cover interest', () => {
    expect(interestPrincipalSplit(1000, 24, 15)).toEqual({ interest: 20, principal: -5 })
  })
})
