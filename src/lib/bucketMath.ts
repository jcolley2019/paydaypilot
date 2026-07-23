import { toISODate } from '@/lib/localDate'

export function bucketProgressPercent(currentBalance: number, targetAmount: number | null): number | null {
  if (targetAmount == null || targetAmount <= 0) return null
  return Math.min(100, Math.max(0, (currentBalance / targetAmount) * 100))
}

export type TargetPaceStatus = 'funded' | 'on_track' | 'behind'

export interface TargetPace {
  status: TargetPaceStatus
  gap: number
}

export function evaluateTargetPace(
  currentBalance: number,
  targetAmount: number,
  perPaycheck: number,
  paychecksRemaining: number,
): TargetPace {
  const gap = targetAmount - currentBalance
  if (gap <= 0) return { status: 'funded', gap: 0 }
  const projected = perPaycheck * paychecksRemaining
  return { status: projected >= gap ? 'on_track' : 'behind', gap }
}

export interface SuggestPerPaycheckInput {
  targetAmount: number | null
  targetDate: string | null
  currentBalance: number
  payDates: string[]
  today?: Date
}

export function suggestPerPaycheck({
  targetAmount,
  targetDate,
  currentBalance,
  payDates,
  today = new Date(),
}: SuggestPerPaycheckInput): number | null {
  if (targetAmount == null || targetDate == null) return null
  const remaining = Math.max(targetAmount - currentBalance, 0)
  const todayISO = toISODate(today)
  const n = payDates.filter((d) => d > todayISO && d <= targetDate).length
  if (n === 0) return null
  return Math.ceil((remaining / n) * 100) / 100
}
