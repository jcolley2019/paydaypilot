import type { AmountType, Bill } from '@/types/bills'
import type { IncomeSource, InstanceStatus } from '@/types/payday'
import { generatePayDates, occurrencesForBill } from '@/lib/paydays'
import { describeDueRule } from '@/lib/dueRules'
import { addDays, toISODate } from '@/lib/localDate'

export interface CalendarPaydayEntry {
  date: string
  real: boolean
  sourceId: string
  sourceName: string
  amount: number
  paycheckId: string | null
}

export interface CalendarBillEntry {
  date: string
  real: boolean
  billId: string
  billName: string
  amount: number
  amountType: AmountType
  dueRuleLabel: string
  status: InstanceStatus | null
  instanceId: string | null
  paycheckId: string | null
}

export interface CalendarDay {
  date: string
  paydays: CalendarPaydayEntry[]
  bills: CalendarBillEntry[]
}

export interface RealPaycheckInput {
  id: string
  income_source_id: string
  pay_date: string
  expected_amount: number
  sourceName: string
}

export interface RealBillInstanceInput {
  id: string
  bill_id: string
  due_date: string
  amount: number
  status: InstanceStatus
  paycheck_id: string | null
}

function inRange(iso: string, fromISO: string, toISO: string): boolean {
  return iso >= fromISO && iso <= toISO
}

/** Full-week calendar grid for a month: spills into the adjacent month(s) as needed. */
export function monthGridDates(year: number, month0: number): Date[] {
  const firstOfMonth = new Date(year, month0, 1)
  const lastOfMonth = new Date(year, month0 + 1, 0)
  const gridStart = addDays(firstOfMonth, -firstOfMonth.getDay())
  const gridEnd = addDays(lastOfMonth, 6 - lastOfMonth.getDay())

  const days: Date[] = []
  let cursor = gridStart
  while (cursor.getTime() <= gridEnd.getTime()) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return days
}

function buildPaydayEntries(
  incomeSources: IncomeSource[],
  realPaychecks: RealPaycheckInput[],
  from: Date,
  to: Date,
): CalendarPaydayEntry[] {
  const fromISO = toISODate(from)
  const toISO = toISODate(to)

  const real: CalendarPaydayEntry[] = realPaychecks
    .filter((p) => inRange(p.pay_date, fromISO, toISO))
    .map((p) => ({
      date: p.pay_date,
      real: true,
      sourceId: p.income_source_id,
      sourceName: p.sourceName,
      amount: p.expected_amount,
      paycheckId: p.id,
    }))

  const realKeys = new Set(real.map((p) => `${p.sourceId}|${p.date}`))

  const computed: CalendarPaydayEntry[] = []
  for (const source of incomeSources.filter((s) => s.active)) {
    for (const date of generatePayDates(source, from, to)) {
      const iso = toISODate(date)
      if (realKeys.has(`${source.id}|${iso}`)) continue
      computed.push({
        date: iso,
        real: false,
        sourceId: source.id,
        sourceName: source.name,
        amount: source.net_amount,
        paycheckId: null,
      })
    }
  }

  return [...real, ...computed]
}

function buildBillEntries(
  bills: Bill[],
  realInstances: RealBillInstanceInput[],
  from: Date,
  to: Date,
): CalendarBillEntry[] {
  const fromISO = toISODate(from)
  const toISO = toISODate(to)
  const billById = new Map(bills.map((b) => [b.id, b]))

  const real: CalendarBillEntry[] = realInstances
    .filter((i) => inRange(i.due_date, fromISO, toISO))
    .map((i) => {
      const bill = billById.get(i.bill_id)
      return {
        date: i.due_date,
        real: true,
        billId: i.bill_id,
        billName: bill?.name ?? 'Bill',
        amount: i.amount,
        amountType: bill?.amount_type ?? 'fixed',
        dueRuleLabel: bill ? describeDueRule(bill.due_rule) : '',
        status: i.status,
        instanceId: i.id,
        paycheckId: i.paycheck_id,
      }
    })

  const realKeys = new Set(real.map((b) => `${b.billId}|${b.date}`))

  const computed: CalendarBillEntry[] = []
  for (const bill of bills.filter((b) => b.active)) {
    const dueRuleLabel = describeDueRule(bill.due_rule)
    for (const date of occurrencesForBill(bill, from, to)) {
      const iso = toISODate(date)
      if (realKeys.has(`${bill.id}|${iso}`)) continue
      computed.push({
        date: iso,
        real: false,
        billId: bill.id,
        billName: bill.name,
        amount: bill.amount,
        amountType: bill.amount_type,
        dueRuleLabel,
        status: null,
        instanceId: null,
        paycheckId: null,
      })
    }
  }

  return [...real, ...computed]
}

export interface BuildCalendarDaysInput {
  incomeSources: IncomeSource[]
  bills: Bill[]
  realPaychecks: RealPaycheckInput[]
  realInstances: RealBillInstanceInput[]
  from: Date
  to: Date
}

/**
 * Merges real (DB-backed) paychecks/bill instances with computed occurrences
 * projected from income schedules and due rules. Real rows always win over a
 * computed occurrence landing on the same source/bill + date.
 */
export function buildCalendarDays({
  incomeSources,
  bills,
  realPaychecks,
  realInstances,
  from,
  to,
}: BuildCalendarDaysInput): Map<string, CalendarDay> {
  const paydays = buildPaydayEntries(incomeSources, realPaychecks, from, to)
  const billEntries = buildBillEntries(bills, realInstances, from, to)

  const map = new Map<string, CalendarDay>()
  function ensure(date: string): CalendarDay {
    let day = map.get(date)
    if (!day) {
      day = { date, paydays: [], bills: [] }
      map.set(date, day)
    }
    return day
  }

  for (const p of paydays) ensure(p.date).paydays.push(p)
  for (const b of billEntries) ensure(b.date).bills.push(b)

  for (const day of map.values()) {
    day.paydays.sort(
      (a, b) => Number(b.real) - Number(a.real) || a.sourceName.localeCompare(b.sourceName),
    )
    day.bills.sort(
      (a, b) => Number(b.real) - Number(a.real) || a.billName.localeCompare(b.billName),
    )
  }

  return map
}
