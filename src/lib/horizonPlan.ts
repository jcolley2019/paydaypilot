import { occurrencesForRule } from '@/lib/paydays'
import { toISODate } from '@/lib/localDate'
import type { Bill } from '@/types/bills'
import type { BillInstance } from '@/types/payday'

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
