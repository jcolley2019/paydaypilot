import type { Bill } from '@/types/bills'
import type { Bucket } from '@/types/buckets'
import type { IncomeSource, Schedule } from '@/types/payday'

const SCHEDULE_MONTHLY_MULTIPLIER: Record<Schedule, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  semimonthly: 2,
  monthly: 1,
  irregular: 0,
}

export function monthlyIncome(incomeSources: IncomeSource[]): number {
  return incomeSources
    .filter((s) => s.active)
    .reduce((sum, s) => sum + s.net_amount * SCHEDULE_MONTHLY_MULTIPLIER[s.schedule], 0)
}

function monthlyPaycheckFrequency(incomeSources: IncomeSource[]): number {
  return incomeSources
    .filter((s) => s.active)
    .reduce((sum, s) => sum + SCHEDULE_MONTHLY_MULTIPLIER[s.schedule], 0)
}

function billMonthlyAmount(bill: Bill): number {
  switch (bill.due_rule.type) {
    case 'monthly_day':
    case 'last_day':
      return bill.amount
    case 'interval_weeks':
      return (bill.amount * (52 / bill.due_rule.weeks)) / 12
    case 'one_off':
      return 0
  }
}

function fixedMonthlyTotal(bills: Bill[]): number {
  return bills
    .filter((b) => b.active && b.csp_bucket === 'fixed')
    .reduce((sum, b) => sum + billMonthlyAmount(b), 0)
}

export type CspCategory = 'fixed' | 'investment' | 'savings' | 'guilt_free'
export type CspStatus = 'under' | 'within' | 'over'

export interface CspCategoryResult {
  actual: number
  percent: number
  targetMin: number
  targetMax: number
  status: CspStatus
}

export interface CspBreakdownResult {
  monthlyIncome: number
  fixed: CspCategoryResult
  investment: CspCategoryResult
  savings: CspCategoryResult
  guilt_free: CspCategoryResult
  overCommitted: boolean
}

const CSP_TARGET_BANDS: Record<CspCategory, [number, number]> = {
  fixed: [50, 60],
  investment: [10, 10],
  savings: [5, 10],
  guilt_free: [20, 35],
}

function categorize(actual: number, income: number, category: CspCategory): CspCategoryResult {
  const percent = income > 0 ? (actual / income) * 100 : 0
  const [targetMin, targetMax] = CSP_TARGET_BANDS[category]
  const status: CspStatus = percent < targetMin ? 'under' : percent > targetMax ? 'over' : 'within'
  return { actual, percent, targetMin, targetMax, status }
}

export function cspBreakdown(
  bills: Bill[],
  buckets: Bucket[],
  incomeSources: IncomeSource[],
): CspBreakdownResult {
  const income = monthlyIncome(incomeSources)
  const paychecksPerMonth = monthlyPaycheckFrequency(incomeSources)

  const fixed = fixedMonthlyTotal(bills)

  const investmentBills = bills
    .filter((b) => b.active && b.csp_bucket === 'investment')
    .reduce((sum, b) => sum + billMonthlyAmount(b), 0)
  const investmentBuckets = buckets
    .filter((b) => b.active && b.kind === 'invest')
    .reduce((sum, b) => sum + b.per_paycheck * paychecksPerMonth, 0)
  const investment = investmentBills + investmentBuckets

  const savingsBills = bills
    .filter((b) => b.active && b.csp_bucket === 'savings')
    .reduce((sum, b) => sum + billMonthlyAmount(b), 0)
  const savingsBuckets = buckets
    .filter((b) => b.active && (b.kind === 'goal' || b.kind === 'emergency'))
    .reduce((sum, b) => sum + b.per_paycheck * paychecksPerMonth, 0)
  const savings = savingsBills + savingsBuckets

  const rawGuiltFree = income - fixed - investment - savings
  const overCommitted = rawGuiltFree < 0
  const guiltFree = Math.max(0, rawGuiltFree)

  return {
    monthlyIncome: income,
    fixed: categorize(fixed, income, 'fixed'),
    investment: categorize(investment, income, 'investment'),
    savings: categorize(savings, income, 'savings'),
    guilt_free: categorize(guiltFree, income, 'guilt_free'),
    overCommitted,
  }
}

const CSP_CATEGORY_ORDER: CspCategory[] = ['fixed', 'investment', 'savings', 'guilt_free']

export function worstCspCategory(breakdown: CspBreakdownResult): CspCategory | null {
  let worst: CspCategory | null = null
  let worstDeviation = 0
  for (const category of CSP_CATEGORY_ORDER) {
    const result = breakdown[category]
    const deviation =
      result.status === 'under'
        ? result.targetMin - result.percent
        : result.status === 'over'
          ? result.percent - result.targetMax
          : 0
    if (deviation > worstDeviation) {
      worstDeviation = deviation
      worst = category
    }
  }
  return worst
}

export interface BabyStepStatusResult {
  currentStep: number
  step1Done: boolean
  step2Done: boolean
  step3Done: boolean
  emergencyBalance: number
  threeMonthTarget: number
  progress: { current: number; target: number }
  nextAction: string
}

const STARTER_EMERGENCY_TARGET = 1000

function formatWhole(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export function babyStepStatus(buckets: Bucket[], bills: Bill[]): BabyStepStatusResult {
  const emergencyBalance = buckets
    .filter((b) => b.active && b.kind === 'emergency')
    .reduce((sum, b) => sum + b.current_balance, 0)

  const activeDebts = bills.filter((b) => b.active && b.is_debt && (b.debt_balance ?? 0) > 0)
  const step1Done = emergencyBalance >= STARTER_EMERGENCY_TARGET
  const step2Done = activeDebts.length === 0

  const fixedMonthly = fixedMonthlyTotal(bills)
  const threeMonthTarget = fixedMonthly * 3
  const step3Done = threeMonthTarget > 0 && emergencyBalance >= threeMonthTarget

  if (!step1Done) {
    const remaining = Math.max(0, STARTER_EMERGENCY_TARGET - emergencyBalance)
    return {
      currentStep: 1,
      step1Done,
      step2Done,
      step3Done,
      emergencyBalance,
      threeMonthTarget,
      progress: { current: emergencyBalance, target: STARTER_EMERGENCY_TARGET },
      nextAction: `Save $${formatWhole(remaining)} more to finish your starter emergency fund.`,
    }
  }

  if (!step2Done) {
    const debtBills = bills.filter((b) => b.is_debt)
    const paidOff = debtBills.filter((b) => (b.debt_balance ?? 0) <= 0).length
    const smallest = [...activeDebts].sort(
      (a, b) => (a.debt_balance ?? 0) - (b.debt_balance ?? 0),
    )[0]
    return {
      currentStep: 2,
      step1Done,
      step2Done,
      step3Done,
      emergencyBalance,
      threeMonthTarget,
      progress: { current: paidOff, target: debtBills.length },
      nextAction: smallest
        ? `Pay minimums on all debts and attack "${smallest.name}" ($${formatWhole(smallest.debt_balance ?? 0)}) with everything extra.`
        : 'Pay off your remaining debt.',
    }
  }

  if (!step3Done) {
    const remaining = Math.max(0, threeMonthTarget - emergencyBalance)
    return {
      currentStep: 3,
      step1Done,
      step2Done,
      step3Done,
      emergencyBalance,
      threeMonthTarget,
      progress: { current: emergencyBalance, target: threeMonthTarget },
      nextAction:
        threeMonthTarget > 0
          ? `Save $${formatWhole(remaining)} more to reach 3 months of expenses ($${formatWhole(threeMonthTarget)}).`
          : 'Add fixed bills so we can calculate your full emergency fund target.',
    }
  }

  return {
    currentStep: 4,
    step1Done,
    step2Done,
    step3Done,
    emergencyBalance,
    threeMonthTarget,
    progress: { current: emergencyBalance, target: threeMonthTarget },
    nextAction: 'Baby Steps 1-3 are complete — keep investing 15% of household income.',
  }
}

export interface SnowballResult {
  snowball: Bill[]
  avalanche: Bill[]
}

export function snowballOrder(bills: Bill[]): SnowballResult {
  const activeDebts = bills.filter((b) => b.active && b.is_debt && (b.debt_balance ?? 0) > 0)
  return {
    snowball: [...activeDebts].sort((a, b) => (a.debt_balance ?? 0) - (b.debt_balance ?? 0)),
    avalanche: [...activeDebts].sort((a, b) => (b.debt_apr ?? 0) - (a.debt_apr ?? 0)),
  }
}

export interface OversubscribedPaycheck {
  paycheckId: string
  payDate: string
  amountOver: number
}

export function findOversubscribedPaycheck(
  paychecks: Array<{ id: string; pay_date: string; expected_amount: number }>,
  billTotalByPaycheck: Map<string, number>,
  bucketContributionTotal: number,
): OversubscribedPaycheck | null {
  const sorted = [...paychecks].sort((a, b) => a.pay_date.localeCompare(b.pay_date))
  for (const pc of sorted) {
    const billTotal = billTotalByPaycheck.get(pc.id) ?? 0
    const remaining = pc.expected_amount - billTotal - bucketContributionTotal
    if (remaining < 0) {
      return {
        paycheckId: pc.id,
        payDate: pc.pay_date,
        amountOver: Math.round(-remaining * 100) / 100,
      }
    }
  }
  return null
}

export type OversubscriptionSuggestion =
  | { type: 'reduce_bucket'; bucketId: string; bucketName: string; reduceBy: number; newPerPaycheck: number }
  | { type: 'move_bill'; instanceId: string; billName: string; amount: number }
  | { type: 'extend_target_date'; bucketId: string; bucketName: string }

export function suggestOversubscriptionFixes(
  amountOver: number,
  buckets: Bucket[],
  flexibleInstances: Array<{ id: string; billName: string; amount: number }>,
): OversubscriptionSuggestion[] {
  const suggestions: OversubscriptionSuggestion[] = []

  const activeBuckets = buckets.filter((b) => b.active && b.per_paycheck > 0)
  if (activeBuckets.length > 0) {
    const largest = [...activeBuckets].sort((a, b) => b.per_paycheck - a.per_paycheck)[0]
    const reduceBy = Math.min(largest.per_paycheck, amountOver)
    suggestions.push({
      type: 'reduce_bucket',
      bucketId: largest.id,
      bucketName: largest.name,
      reduceBy: Math.round(reduceBy * 100) / 100,
      newPerPaycheck: Math.round((largest.per_paycheck - reduceBy) * 100) / 100,
    })
  }

  if (flexibleInstances.length > 0) {
    const clearing = flexibleInstances
      .filter((i) => i.amount >= amountOver)
      .sort((a, b) => a.amount - b.amount)
    const candidate = clearing[0] ?? [...flexibleInstances].sort((a, b) => b.amount - a.amount)[0]
    suggestions.push({
      type: 'move_bill',
      instanceId: candidate.id,
      billName: candidate.billName,
      amount: candidate.amount,
    })
  }

  const targetBuckets = buckets.filter((b) => b.active && b.kind !== 'emergency' && b.target_date)
  if (targetBuckets.length > 0) {
    const goal = targetBuckets[0]
    suggestions.push({ type: 'extend_target_date', bucketId: goal.id, bucketName: goal.name })
  }

  return suggestions
}
