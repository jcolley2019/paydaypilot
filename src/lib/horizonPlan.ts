import { assignInstances } from '@/lib/assignment'
import { generatePayDates, occurrencesForRule } from '@/lib/paydays'
import { toISODate } from '@/lib/localDate'
import type { Bill } from '@/types/bills'
import type { BillInstance, IncomeSource, Paycheck } from '@/types/payday'

export interface PaycheckSeed {
  income_source_id: string
  pay_date: string
  expected_amount: number
}

export interface PaycheckSyncPlan {
  /** Scheduled pay dates that have no paycheck yet, or whose paycheck carries an old expected amount. */
  upserts: PaycheckSeed[]
  /** Upcoming paychecks, not yet actualized, that are off their source's schedule (or whose source is gone/inactive). */
  deleteIds: string[]
}

/**
 * What a sync has to change so the paychecks between `from` and `to` match the active income
 * sources. A paycheck with an actual amount is a record of money received and is never removed;
 * neither is anything dated outside the window. Irregular sources have no schedule to fall off —
 * their paychecks are entered by hand and stay while the source is active.
 */
export function planPaycheckSync(
  sources: IncomeSource[],
  existing: Paycheck[],
  from: Date,
  to: Date,
): PaycheckSyncPlan {
  const fromISO = toISODate(from)
  const toISO = toISODate(to)

  const scheduled = new Map<string, { amount: number; handEntered: boolean; dates: Set<string> }>()
  for (const source of sources) {
    if (!source.active) continue
    scheduled.set(source.id, {
      amount: source.net_amount,
      handEntered: source.schedule === 'irregular',
      dates: new Set(generatePayDates(source, from, to).map(toISODate)),
    })
  }

  const held = new Map(existing.map((paycheck) => [`${paycheck.income_source_id}|${paycheck.pay_date}`, paycheck]))
  const upserts: PaycheckSeed[] = []
  for (const [sourceId, { amount, dates }] of scheduled) {
    for (const payDate of dates) {
      const paycheck = held.get(`${sourceId}|${payDate}`)
      if (!paycheck || Number(paycheck.expected_amount) !== Number(amount)) {
        upserts.push({ income_source_id: sourceId, pay_date: payDate, expected_amount: amount })
      }
    }
  }

  const deleteIds: string[] = []
  for (const paycheck of existing) {
    if (paycheck.actual_amount != null) continue
    if (paycheck.pay_date < fromISO || paycheck.pay_date > toISO) continue

    const source = scheduled.get(paycheck.income_source_id)
    if (source && (source.handEntered || source.dates.has(paycheck.pay_date))) continue
    deleteIds.push(paycheck.id)
  }

  return { upserts, deleteIds }
}

export interface InstanceSeed {
  bill_id: string
  due_date: string
  amount: number
}

export interface InstanceAmountUpdate {
  id: string
  amount: number
}

export interface InstanceSyncPlan {
  /** Occurrences of active bills that have no instance yet. */
  inserts: InstanceSeed[]
  /** Planned instances whose amount no longer matches their bill. */
  amountUpdates: InstanceAmountUpdate[]
  /** Planned, non-override instances that no longer fall on their bill's rule (or whose bill is gone/inactive). */
  deleteIds: string[]
}

/**
 * What a sync has to change so the instances between `from` and `to` match the active bills.
 * Paid and skipped instances are history and are never changed. An override pins an instance
 * to its paycheck, so it survives a rule change, but it still follows the bill's amount.
 * Instances outside the window are left alone.
 */
export function planInstanceSync(
  activeBills: Pick<Bill, 'id' | 'amount' | 'due_rule'>[],
  existing: BillInstance[],
  from: Date,
  to: Date,
): InstanceSyncPlan {
  const fromISO = toISODate(from)
  const toISO = toISODate(to)

  const expected = new Map<string, { amount: number; dates: Set<string> }>()
  for (const bill of activeBills) {
    expected.set(bill.id, {
      amount: bill.amount,
      dates: new Set(occurrencesForRule(bill.due_rule, from, to).map(toISODate)),
    })
  }

  const taken = new Set(existing.map((instance) => `${instance.bill_id}|${instance.due_date}`))
  const inserts: InstanceSeed[] = []
  for (const [billId, { amount, dates }] of expected) {
    for (const dueDate of dates) {
      if (!taken.has(`${billId}|${dueDate}`)) inserts.push({ bill_id: billId, due_date: dueDate, amount })
    }
  }

  const amountUpdates: InstanceAmountUpdate[] = []
  const deleteIds: string[] = []
  for (const instance of existing) {
    if (instance.status !== 'planned') continue
    if (instance.due_date < fromISO || instance.due_date > toISO) continue

    const bill = expected.get(instance.bill_id)
    const onRule = bill?.dates.has(instance.due_date) ?? false
    if (!onRule && !instance.override) {
      deleteIds.push(instance.id)
      continue
    }
    if (bill && Number(instance.amount) !== Number(bill.amount)) {
      amountUpdates.push({ id: instance.id, amount: bill.amount })
    }
  }

  return { inserts, amountUpdates, deleteIds }
}

export interface InstanceAssignmentUpdate {
  id: string
  paycheck_id: string | null
  /** Set when the paycheck this instance was pinned to is gone, so it follows the plan again. */
  releaseOverride: boolean
}

/**
 * The planned instances that belong on a different paycheck than the one they carry — run on
 * the rows as they stand after paychecks were added and removed. An override stays where the
 * user put it unless that paycheck no longer exists (its paycheck_id came back empty). Paid and
 * skipped instances are history: if their paycheck was removed they simply stay unassigned.
 */
export function planAssignmentUpdates(
  instances: BillInstance[],
  paychecks: Paycheck[],
  bufferDays: number,
): InstanceAssignmentUpdate[] {
  const orphaned = new Set(
    instances
      .filter((instance) => instance.status === 'planned' && instance.override && instance.paycheck_id === null)
      .map((instance) => instance.id),
  )
  const assignable = instances.map((instance) =>
    orphaned.has(instance.id) ? { ...instance, override: false } : instance,
  )
  const assignments = assignInstances(assignable, paychecks, bufferDays)

  const updates: InstanceAssignmentUpdate[] = []
  for (const instance of assignable) {
    if (instance.override || instance.status !== 'planned') continue
    const assignment = assignments.get(instance.id)
    if (!assignment) continue
    const releaseOverride = orphaned.has(instance.id)
    if (assignment.paycheckId !== instance.paycheck_id || releaseOverride) {
      updates.push({ id: instance.id, paycheck_id: assignment.paycheckId, releaseOverride })
    }
  }
  return updates
}
