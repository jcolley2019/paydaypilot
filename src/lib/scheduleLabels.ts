import type { IncomeSource, Schedule } from '@/types/payday'
import { parseISODate } from '@/lib/localDate'

export const SCHEDULE_LABELS: Record<Schedule, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month',
  monthly: 'Monthly',
  irregular: 'Irregular',
}

function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

function dayLabel(day: number): string {
  return day === 31 ? 'last day' : `the ${ordinal(day)}`
}

function formatShortDate(iso: string): string {
  const d = parseISODate(iso)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
}

export function describeSchedule(source: IncomeSource): string {
  switch (source.schedule) {
    case 'weekly':
      return source.anchor_date ? `Weekly (from ${formatShortDate(source.anchor_date)})` : 'Weekly'
    case 'biweekly':
      return source.anchor_date
        ? `Every 2 weeks (from ${formatShortDate(source.anchor_date)})`
        : 'Every 2 weeks'
    case 'semimonthly':
      if (!source.semimonthly_days || source.semimonthly_days.length === 0) return 'Twice a month'
      return `Twice a month: ${source.semimonthly_days.map(dayLabel).join(' & ')}`
    case 'monthly':
      return source.monthly_day != null ? `Monthly on ${dayLabel(source.monthly_day)}` : 'Monthly'
    case 'irregular':
      return 'Irregular (added manually)'
  }
}
