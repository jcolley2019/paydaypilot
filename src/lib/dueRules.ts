import type { DueRule } from '@/types/bills'
import {
  addDays,
  calendarDaysBetween,
  clampedMonthlyDate as clampedDate,
  parseISODate as parseLocalISODate,
} from '@/lib/localDate'

export const MIN_INTERVAL_MONTHS = 2
export const MAX_INTERVAL_MONTHS = 24

export function isValidIntervalMonths(months: number): boolean {
  return Number.isInteger(months) && months >= MIN_INTERVAL_MONTHS && months <= MAX_INTERVAL_MONTHS
}

/**
 * The first anchor + k·months occurrence on or after `fromDate` (k ≥ 0). Each step is
 * taken from the anchor's own Y/M/D, so a 31st anchor lands on the 30th in a 30-day
 * month and is back on the 31st the next time round — the clamp never accumulates.
 */
function nextIntervalMonthsDate(anchorISO: string, months: number, fromDate: Date): Date {
  const anchor = parseLocalISODate(anchorISO)
  if (anchor.getTime() >= fromDate.getTime()) return anchor
  const year = anchor.getFullYear()
  const month0 = anchor.getMonth()
  const day = anchor.getDate()
  const monthsApart = (fromDate.getFullYear() - year) * 12 + (fromDate.getMonth() - month0)
  let k = Math.max(0, Math.floor(monthsApart / months))
  let candidate = clampedDate(year, month0 + k * months, day)
  while (candidate.getTime() < fromDate.getTime()) {
    k += 1
    candidate = clampedDate(year, month0 + k * months, day)
  }
  return candidate
}

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
      const diffDays = calendarDaysBetween(anchor, fromDate)
      if (diffDays <= 0) return anchor
      const k = Math.ceil(diffDays / intervalDays)
      return addDays(anchor, k * intervalDays)
    }

    case 'interval_months':
      return nextIntervalMonthsDate(rule.anchor, rule.months, fromDate)

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
    case 'interval_months': {
      const anchor = formatShortDate(parseISODate(rule.anchor))
      return rule.months === 12 ? `Yearly on ${anchor}` : `Every ${rule.months} months (from ${anchor})`
    }
    case 'one_off':
      return `Once on ${formatLongDate(parseISODate(rule.date))}`
  }
}
