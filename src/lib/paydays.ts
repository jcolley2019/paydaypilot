import type { Bill, DueRule } from '@/types/bills'
import type { IncomeSource } from '@/types/payday'
import { nextDueDate } from '@/lib/dueRules'
import { addDays, clampedMonthlyDate, dateOnly, parseISODate } from '@/lib/localDate'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MAX_OCCURRENCES = 100

function inRange(d: Date, from: Date, to: Date): boolean {
  return d.getTime() >= from.getTime() && d.getTime() <= to.getTime()
}

function generateIntervalDates(anchor: Date, intervalDays: number, from: Date, to: Date): Date[] {
  const dates: Date[] = []
  const diffDays = Math.floor((from.getTime() - anchor.getTime()) / MS_PER_DAY)
  const k = Math.max(0, Math.floor(diffDays / intervalDays))
  let candidate = addDays(anchor, k * intervalDays)
  while (candidate.getTime() < from.getTime()) {
    candidate = addDays(candidate, intervalDays)
  }
  while (candidate.getTime() <= to.getTime()) {
    dates.push(candidate)
    candidate = addDays(candidate, intervalDays)
  }
  return dates
}

function monthsBetween(from: Date, to: Date): Array<{ year: number; month0: number }> {
  const months: Array<{ year: number; month0: number }> = []
  let year = from.getFullYear()
  let month0 = from.getMonth()
  while (year < to.getFullYear() || (year === to.getFullYear() && month0 <= to.getMonth())) {
    months.push({ year, month0 })
    month0 += 1
    if (month0 > 11) {
      month0 = 0
      year += 1
    }
  }
  return months
}

export function generatePayDates(source: IncomeSource, from: Date, to: Date): Date[] {
  const fromDate = dateOnly(from)
  const toDate = dateOnly(to)

  switch (source.schedule) {
    case 'weekly':
    case 'biweekly': {
      if (!source.anchor_date) return []
      const anchor = parseISODate(source.anchor_date)
      const intervalDays = source.schedule === 'weekly' ? 7 : 14
      return generateIntervalDates(anchor, intervalDays, fromDate, toDate)
    }

    case 'semimonthly': {
      if (!source.semimonthly_days || source.semimonthly_days.length === 0) return []
      const dates: Date[] = []
      for (const { year, month0 } of monthsBetween(fromDate, toDate)) {
        for (const day of source.semimonthly_days) {
          const candidate = clampedMonthlyDate(year, month0, day)
          if (inRange(candidate, fromDate, toDate)) dates.push(candidate)
        }
      }
      dates.sort((a, b) => a.getTime() - b.getTime())
      return dates
    }

    case 'monthly': {
      if (source.monthly_day == null) return []
      const dates: Date[] = []
      for (const { year, month0 } of monthsBetween(fromDate, toDate)) {
        const candidate = clampedMonthlyDate(year, month0, source.monthly_day)
        if (inRange(candidate, fromDate, toDate)) dates.push(candidate)
      }
      return dates
    }

    case 'irregular':
      return []
  }
}

export function occurrencesForBill(bill: Bill, from: Date, to: Date): Date[] {
  return occurrencesForRule(bill.due_rule, from, to)
}

export function occurrencesForRule(rule: DueRule, from: Date, to: Date): Date[] {
  const fromDate = dateOnly(from)
  const toDate = dateOnly(to)
  const dates: Date[] = []

  let cursor = fromDate
  let iterations = 0
  while (iterations < MAX_OCCURRENCES) {
    iterations += 1
    const next = nextDueDate(rule, cursor)
    if (!next || next.getTime() > toDate.getTime()) break
    dates.push(next)
    cursor = addDays(next, 1)
  }

  return dates
}
