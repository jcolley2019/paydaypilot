import type { DueRule } from '@/types/bills'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate()
}

function clampedMonthlyDate(year: number, month0: number, day: number): Date {
  return new Date(year, month0, Math.min(day, daysInMonth(year, month0)))
}

function lastDayOfMonth(year: number, month0: number): Date {
  return new Date(year, month0 + 1, 0)
}

export function nextDueDate(rule: DueRule, from: Date): Date | null {
  const fromDate = dateOnly(from)

  switch (rule.type) {
    case 'monthly_day': {
      let candidate = clampedMonthlyDate(fromDate.getFullYear(), fromDate.getMonth(), rule.day)
      if (candidate.getTime() < fromDate.getTime()) {
        candidate = clampedMonthlyDate(fromDate.getFullYear(), fromDate.getMonth() + 1, rule.day)
      }
      return candidate
    }

    case 'last_day': {
      let candidate = lastDayOfMonth(fromDate.getFullYear(), fromDate.getMonth())
      if (candidate.getTime() < fromDate.getTime()) {
        candidate = lastDayOfMonth(fromDate.getFullYear(), fromDate.getMonth() + 1)
      }
      return candidate
    }

    case 'interval_weeks': {
      const anchor = parseISODate(rule.anchor)
      const intervalDays = rule.weeks * 7
      const diffDays = Math.round((fromDate.getTime() - anchor.getTime()) / MS_PER_DAY)
      if (diffDays <= 0) return anchor
      const k = Math.ceil(diffDays / intervalDays)
      return new Date(anchor.getTime() + k * intervalDays * MS_PER_DAY)
    }

    case 'one_off': {
      const date = parseISODate(rule.date)
      return date.getTime() >= fromDate.getTime() ? date : null
    }
  }
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

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

function formatShortDate(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
}

function formatLongDate(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export function describeDueRule(rule: DueRule): string {
  switch (rule.type) {
    case 'monthly_day':
      return `Monthly on the ${ordinal(rule.day)}`
    case 'last_day':
      return 'Last day of month'
    case 'interval_weeks':
      return `Every ${rule.weeks} week${rule.weeks === 1 ? '' : 's'} (from ${formatShortDate(parseISODate(rule.anchor))})`
    case 'one_off':
      return `Once on ${formatLongDate(parseISODate(rule.date))}`
  }
}
