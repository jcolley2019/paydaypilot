import { describe, it, expect } from 'vitest'
import { planInstanceSync, type InstanceSyncPlan } from './horizonPlan'
import { assignInstances } from './assignment'
import type { Bill, DueRule } from '@/types/bills'
import type { BillInstance, Paycheck } from '@/types/payday'

type PlanBill = Pick<Bill, 'id' | 'amount' | 'due_rule'>

// Jul 1 – Oct 29, 2026: four monthly occurrences, no daylight-saving change inside.
const FROM = new Date(2026, 6, 1)
const TO = new Date(2026, 9, 29)

function bill(due_rule: DueRule, overrides: Partial<PlanBill> = {}): PlanBill {
  return { id: 'bill-1', amount: 100, due_rule, ...overrides }
}

function instance(overrides: Partial<BillInstance>): BillInstance {
  return {
    id: 'bi-1',
    user_id: 'user-1',
    bill_id: 'bill-1',
    due_date: '2026-07-10',
    amount: 100,
    paycheck_id: null,
    override: false,
    status: 'planned',
    paid_at: null,
    ...overrides,
  }
}

/** What the table holds once a sync has carried out the plan. */
function applyPlan(existing: BillInstance[], plan: InstanceSyncPlan): BillInstance[] {
  const amounts = new Map(plan.amountUpdates.map(({ id, amount }) => [id, amount]))
  const kept = existing
    .filter((row) => !plan.deleteIds.includes(row.id))
    .map((row) => ({ ...row, amount: amounts.get(row.id) ?? row.amount }))
  const added = plan.inserts.map((seed) => instance({ ...seed, id: `new-${seed.bill_id}-${seed.due_date}` }))
  return [...kept, ...added]
}

function dueDates(rows: BillInstance[]): string[] {
  return rows.map((row) => row.due_date).sort()
}

describe('planInstanceSync — new bills', () => {
  it('creates an instance for every occurrence of a bill that has none yet', () => {
    const plan = planInstanceSync([bill({ type: 'monthly_day', day: 10 }, { amount: 48.2 })], [], FROM, TO)
    expect(plan.inserts).toEqual([
      { bill_id: 'bill-1', due_date: '2026-07-10', amount: 48.2 },
      { bill_id: 'bill-1', due_date: '2026-08-10', amount: 48.2 },
      { bill_id: 'bill-1', due_date: '2026-09-10', amount: 48.2 },
      { bill_id: 'bill-1', due_date: '2026-10-10', amount: 48.2 },
    ])
    expect(plan.amountUpdates).toEqual([])
    expect(plan.deleteIds).toEqual([])
  })

  it('does nothing when the instances already match the bills', () => {
    const bills = [bill({ type: 'monthly_day', day: 10 })]
    const synced = applyPlan([], planInstanceSync(bills, [], FROM, TO))
    expect(planInstanceSync(bills, synced, FROM, TO)).toEqual({ inserts: [], amountUpdates: [], deleteIds: [] })
  })
})

describe('planInstanceSync — amount edits', () => {
  const edited = bill({ type: 'monthly_day', day: 10 }, { amount: 120 })

  it('moves planned instances to the new amount and leaves paid and skipped ones alone', () => {
    const existing = [
      instance({ id: 'bi-paid', due_date: '2026-07-10', status: 'paid', paid_at: '2026-07-09T12:00:00Z' }),
      instance({ id: 'bi-skipped', due_date: '2026-08-10', status: 'skipped' }),
      instance({ id: 'bi-planned', due_date: '2026-09-10' }),
      instance({ id: 'bi-override', due_date: '2026-10-10', override: true, paycheck_id: 'pc-manual' }),
    ]
    const plan = planInstanceSync([edited], existing, FROM, TO)

    expect(plan.amountUpdates).toEqual([
      { id: 'bi-planned', amount: 120 },
      { id: 'bi-override', amount: 120 },
    ])
    expect(plan.deleteIds).toEqual([])
    expect(plan.inserts).toEqual([])

    const after = new Map(applyPlan(existing, plan).map((row) => [row.id, row.amount]))
    expect(after.get('bi-paid')).toBe(100)
    expect(after.get('bi-skipped')).toBe(100)
    expect(after.get('bi-planned')).toBe(120)
    expect(after.get('bi-override')).toBe(120)
  })

  it('leaves instances that already carry the bill amount out of the plan', () => {
    const existing = [
      instance({ id: 'bi-current', due_date: '2026-07-10', amount: 120 }),
      instance({ id: 'bi-old', due_date: '2026-08-10', amount: 100 }),
    ]
    const plan = planInstanceSync([edited], existing, FROM, TO)
    expect(plan.amountUpdates).toEqual([{ id: 'bi-old', amount: 120 }])
  })

  it('keeps each bill to its own amount', () => {
    const bills = [edited, bill({ type: 'last_day' }, { id: 'bill-2', amount: 55 })]
    const existing = [
      instance({ id: 'bi-a', due_date: '2026-07-10', amount: 100 }),
      instance({ id: 'bi-b', bill_id: 'bill-2', due_date: '2026-07-31', amount: 55 }),
    ]
    expect(planInstanceSync(bills, existing, FROM, TO).amountUpdates).toEqual([{ id: 'bi-a', amount: 120 }])
  })
})

describe('planInstanceSync — due-rule changes', () => {
  // The bill used to be due on the 10th; it is now due on the 20th.
  const moved = bill({ type: 'monthly_day', day: 20 })
  const existing = [
    instance({ id: 'bi-paid', due_date: '2026-07-10', status: 'paid', paid_at: '2026-07-09T12:00:00Z' }),
    instance({ id: 'bi-skipped', due_date: '2026-08-10', status: 'skipped' }),
    instance({ id: 'bi-override', due_date: '2026-09-10', override: true, paycheck_id: 'pc-manual' }),
    instance({ id: 'bi-stale', due_date: '2026-10-10' }),
  ]

  it('removes stale planned instances and preserves paid, skipped and overridden ones', () => {
    const plan = planInstanceSync([moved], existing, FROM, TO)
    expect(plan.deleteIds).toEqual(['bi-stale'])

    const ids = applyPlan(existing, plan).map((row) => row.id)
    expect(ids).toEqual(expect.arrayContaining(['bi-paid', 'bi-skipped', 'bi-override']))
    expect(ids).not.toContain('bi-stale')
  })

  it('leaves no duplicates: planned instances sit on the new dates only, once each', () => {
    const after = applyPlan(existing, planInstanceSync([moved], existing, FROM, TO))

    const regenerated = after.filter((row) => row.status === 'planned' && !row.override)
    expect(dueDates(regenerated)).toEqual(['2026-07-20', '2026-08-20', '2026-09-20', '2026-10-20'])

    const keys = after.map((row) => `${row.bill_id}|${row.due_date}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('is stable: a second sync after the rule change has nothing left to do', () => {
    const after = applyPlan(existing, planInstanceSync([moved], existing, FROM, TO))
    expect(planInstanceSync([moved], after, FROM, TO)).toEqual({ inserts: [], amountUpdates: [], deleteIds: [] })
  })

  it('handles a change of rule type the same way', () => {
    const weekly = bill({ type: 'interval_weeks', weeks: 2, anchor: '2026-07-03' })
    const before = [
      instance({ id: 'bi-jul', due_date: '2026-07-10' }),
      instance({ id: 'bi-aug', due_date: '2026-08-10' }),
    ]
    const after = applyPlan(before, planInstanceSync([weekly], before, FROM, TO))
    expect(dueDates(after)).toEqual([
      '2026-07-03',
      '2026-07-17',
      '2026-07-31',
      '2026-08-14',
      '2026-08-28',
      '2026-09-11',
      '2026-09-25',
      '2026-10-09',
      '2026-10-23',
    ])
  })

  it('keeps an instance whose date is still on the new rule', () => {
    const lastDay = bill({ type: 'last_day' })
    const before = [
      instance({ id: 'bi-shared', due_date: '2026-07-31', paycheck_id: 'pc-1' }),
      instance({ id: 'bi-gone', due_date: '2026-08-15' }),
    ]
    const plan = planInstanceSync([lastDay], before, FROM, TO)
    expect(plan.deleteIds).toEqual(['bi-gone'])
    expect(plan.inserts.map((seed) => seed.due_date)).toEqual(['2026-08-31', '2026-09-30'])
  })

  it('an edit to both amount and rule updates the override it keeps and regenerates the rest', () => {
    const changed = bill({ type: 'monthly_day', day: 20 }, { amount: 75 })
    const plan = planInstanceSync([changed], existing, FROM, TO)
    expect(plan.amountUpdates).toEqual([{ id: 'bi-override', amount: 75 }])
    expect(plan.deleteIds).toEqual(['bi-stale'])
    expect(plan.inserts.every((seed) => seed.amount === 75)).toBe(true)
  })
})

describe('planInstanceSync — bills that are gone or inactive', () => {
  it('removes their planned instances and keeps paid and overridden ones', () => {
    const existing = [
      instance({ id: 'bi-paid', bill_id: 'bill-off', due_date: '2026-07-10', status: 'paid' }),
      instance({ id: 'bi-override', bill_id: 'bill-off', due_date: '2026-08-10', override: true }),
      instance({ id: 'bi-planned', bill_id: 'bill-off', due_date: '2026-09-10' }),
    ]
    const plan = planInstanceSync([], existing, FROM, TO)
    expect(plan).toEqual({ inserts: [], amountUpdates: [], deleteIds: ['bi-planned'] })
  })
})

describe('planInstanceSync — window', () => {
  it('leaves instances outside the sync window untouched', () => {
    const existing = [
      instance({ id: 'bi-before', due_date: '2026-06-15', amount: 80 }),
      instance({ id: 'bi-after', due_date: '2026-11-15', amount: 80 }),
    ]
    const plan = planInstanceSync([bill({ type: 'monthly_day', day: 10 })], existing, FROM, TO)
    expect(plan.deleteIds).toEqual([])
    expect(plan.amountUpdates).toEqual([])
  })
})

describe('sync plan + assignment', () => {
  it('assigns the regenerated instances and leaves the kept override on its paycheck', () => {
    const paychecks: Paycheck[] = ['2026-07-03', '2026-08-14', '2026-09-11', '2026-10-09'].map((pay_date, i) => ({
      id: `pc-${i + 1}`,
      user_id: 'user-1',
      income_source_id: 'src-1',
      pay_date,
      expected_amount: 1000,
      actual_amount: null,
    }))
    const existing = [
      instance({ id: 'bi-override', due_date: '2026-09-10', override: true, paycheck_id: 'pc-1' }),
      instance({ id: 'bi-stale', due_date: '2026-10-10', paycheck_id: 'pc-4' }),
    ]
    const moved = bill({ type: 'monthly_day', day: 20 })
    const after = applyPlan(existing, planInstanceSync([moved], existing, FROM, TO))
    const assignments = assignInstances(after, paychecks, 3)

    expect(assignments.get('bi-override')).toEqual({ paycheckId: 'pc-1', alert: 'none' })
    expect(assignments.get('new-bill-1-2026-07-20')).toEqual({ paycheckId: 'pc-1', alert: 'none' })
    expect(assignments.get('new-bill-1-2026-08-20')).toEqual({ paycheckId: 'pc-2', alert: 'none' })
    expect(assignments.get('new-bill-1-2026-09-20')).toEqual({ paycheckId: 'pc-3', alert: 'none' })
    expect(assignments.get('new-bill-1-2026-10-20')).toEqual({ paycheckId: 'pc-4', alert: 'none' })
    expect(assignments.has('bi-stale')).toBe(false)
  })
})
