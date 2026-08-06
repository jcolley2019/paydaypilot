const MAX_AMORTIZATION_MONTHS = 1200 // 100 years — anything beyond this is effectively "never"

export interface PayoffResult {
  neverPaysOff: boolean
  months: number | null
  totalInterest: number | null
}

/** Standard fixed-payment amortization. Detects payments that don't outpace interest. */
export function payoffMonths(balance: number, apr: number, payment: number): PayoffResult {
  if (balance <= 0) return { neverPaysOff: false, months: 0, totalInterest: 0 }

  const monthlyRate = apr / 100 / 12
  let remaining = balance
  let months = 0
  let totalInterest = 0

  while (remaining > 0) {
    const interest = remaining * monthlyRate
    if (payment <= interest) {
      return { neverPaysOff: true, months: null, totalInterest: null }
    }
    if (months >= MAX_AMORTIZATION_MONTHS) {
      return { neverPaysOff: true, months: null, totalInterest: null }
    }
    const principal = Math.min(payment - interest, remaining)
    remaining -= principal
    totalInterest += interest
    months += 1
  }

  return { neverPaysOff: false, months, totalInterest: Math.round(totalInterest * 100) / 100 }
}

/** Card-style declining minimum: each month's payment is the greater of a flat floor or a % of the current balance. */
export function minimumPaymentSchedule(
  balance: number,
  apr: number,
  minPercent: number,
  minFloor: number,
): PayoffResult {
  if (balance <= 0) return { neverPaysOff: false, months: 0, totalInterest: 0 }

  const monthlyRate = apr / 100 / 12
  let remaining = balance
  let months = 0
  let totalInterest = 0

  while (remaining > 0) {
    const interest = remaining * monthlyRate
    const payment = Math.max(minFloor, remaining * (minPercent / 100))
    if (payment <= interest) {
      return { neverPaysOff: true, months: null, totalInterest: null }
    }
    if (months >= MAX_AMORTIZATION_MONTHS) {
      return { neverPaysOff: true, months: null, totalInterest: null }
    }
    const principal = Math.min(payment - interest, remaining)
    remaining -= principal
    totalInterest += interest
    months += 1
  }

  return { neverPaysOff: false, months, totalInterest: Math.round(totalInterest * 100) / 100 }
}

export interface WhatIfResult {
  baseNeverPaysOff: boolean
  newNeverPaysOff: boolean
  monthsSaved: number | null
  interestSaved: number | null
}

/** Compares payoff at basePayment vs basePayment+extraPayment. Savings are null whenever the baseline never pays off. */
export function whatIfPayment(
  balance: number,
  apr: number,
  basePayment: number,
  extraPayment: number,
): WhatIfResult {
  const base = payoffMonths(balance, apr, basePayment)
  const withExtra = payoffMonths(balance, apr, basePayment + extraPayment)

  if (base.neverPaysOff || withExtra.neverPaysOff) {
    return {
      baseNeverPaysOff: base.neverPaysOff,
      newNeverPaysOff: withExtra.neverPaysOff,
      monthsSaved: null,
      interestSaved: null,
    }
  }

  return {
    baseNeverPaysOff: false,
    newNeverPaysOff: false,
    monthsSaved: (base.months ?? 0) - (withExtra.months ?? 0),
    interestSaved: Math.round(((base.totalInterest ?? 0) - (withExtra.totalInterest ?? 0)) * 100) / 100,
  }
}

export interface UtilizationTargets {
  currentPercent: number
  dollarsTo30: number
  dollarsTo10: number
}

/** Utilization % and dollars needed to reach the 30% and 10% thresholds commonly cited for credit scoring. */
export function utilizationTargets(balance: number, limit: number): UtilizationTargets | null {
  if (limit <= 0) return null

  const currentPercent = Math.round((balance / limit) * 10000) / 100
  const dollarsTo30 = Math.max(0, Math.round((balance - limit * 0.3) * 100) / 100)
  const dollarsTo10 = Math.max(0, Math.round((balance - limit * 0.1) * 100) / 100)

  return { currentPercent, dollarsTo30, dollarsTo10 }
}

export interface InterestPrincipalSplit {
  interest: number
  principal: number
}

/** This month's interest/principal split for a given payment. Principal goes negative if payment doesn't cover interest. */
export function interestPrincipalSplit(balance: number, apr: number, payment: number): InterestPrincipalSplit {
  const monthlyRate = apr / 100 / 12
  const interest = Math.round(balance * monthlyRate * 100) / 100
  const principal = Math.round((payment - interest) * 100) / 100
  return { interest, principal }
}
