import type { BillInstance, InstanceAlert, Paycheck } from '@/types/payday'
import { addDays, parseISODate } from '@/lib/localDate'

export interface Assignment {
  paycheckId: string | null
  alert: InstanceAlert
}

export function assignInstances(
  instances: BillInstance[],
  paychecks: Paycheck[],
  bufferDays: number,
): Map<string, Assignment> {
  const result = new Map<string, Assignment>()
  const sortedPaychecks = [...paychecks].sort(
    (a, b) => parseISODate(a.pay_date).getTime() - parseISODate(b.pay_date).getTime(),
  )

  for (const instance of instances) {
    if (instance.override || instance.status === 'paid') {
      result.set(instance.id, { paycheckId: instance.paycheck_id, alert: 'none' })
      continue
    }

    if (sortedPaychecks.length === 0) {
      result.set(instance.id, { paycheckId: null, alert: 'none' })
      continue
    }

    const dueDate = parseISODate(instance.due_date)
    const latestEligibleDate = addDays(dueDate, -bufferDays)

    let eligible: Paycheck | null = null
    for (const paycheck of sortedPaychecks) {
      if (parseISODate(paycheck.pay_date).getTime() <= latestEligibleDate.getTime()) {
        eligible = paycheck
      } else {
        break
      }
    }

    if (eligible) {
      result.set(instance.id, { paycheckId: eligible.id, alert: 'none' })
    } else {
      result.set(instance.id, { paycheckId: sortedPaychecks[0].id, alert: 'due_before_payday' })
    }
  }

  return result
}

export interface PaycheckLoad {
  billTotal: number
  remaining: number
  oversubscribed: boolean
}

export function paycheckLoad(paycheck: Paycheck, assignedInstances: BillInstance[]): PaycheckLoad {
  const billTotal = assignedInstances.reduce((sum, instance) => sum + instance.amount, 0)
  const remaining = paycheck.expected_amount - billTotal
  return {
    billTotal,
    remaining,
    oversubscribed: remaining < 0,
  }
}
