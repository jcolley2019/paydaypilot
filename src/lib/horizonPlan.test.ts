import { describe, it, expect } from 'vitest'
import {
  planAssignmentUpdates,
  planInstanceSync,
  planPaycheckSync,
  type InstanceAssignmentUpdate,
  type InstanceSyncPlan,
  type PaycheckSyncPlan,
} from './horizonPlan'
import { assignInstances } from './assignment'
import type { Bill, DueRule } from '@/types/bills'
import type { BillInstance, IncomeSource, Paycheck } from '@/types/payday'

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

// The shape PP.8.1 found in a real account: a biweekly job paid on Wednesdays, plus the
// day-early Tuesday rows written while date stepping was off by a day after fall-back.
// The window is the sync's own: today (Mon Nov 16, 2026) plus 90 days.
const TODAY = new Date(2026, 10, 16)
const HORIZON_END = new Date(2027, 1, 14)
const WEDNESDAYS = ['2026-11-25', '2026-12-09', '2026-12-23', '2027-01-06', '2027-01-20', '2027-02-03']
const TUESDAYS = ['2026-11-24', '2026-12-08', '2026-12-22', '2027-01-05', '2027-01-19', '2027-02-02']

function source(overrides: Partial<IncomeSource> = {}): IncomeSource {
  return {
    id: 'src-1',
    user_id: 'user-1',
    name: 'Day job',
    net_amount: 3290,
    schedule: 'biweekly',
    anchor_date: '2026-10-14',
    semimonthly_days: null,
    monthly_day: null,
    active: true,
    ...overrides,
  }
}

function paycheck(pay_date: string, overrides: Partial<Paycheck> = {}): Paycheck {
  return {
    id: `pc-${pay_date}`,
    user_id: 'user-1',
    income_source_id: 'src-1',
    pay_date,
    expected_amount: 3290,
    actual_amount: null,
    ...overrides,
  }
}

const real = WEDNESDAYS.map((date) => paycheck(date))
const phantoms = TUESDAYS.map((date) => paycheck(date))

/**
 * What the tables hold once a sync has carried out the paycheck plan. Deleting a paycheck
 * empties paycheck_id on the instances that pointed at it, as the foreign key does.
 */
function applyPaycheckPlan(
  paychecks: Paycheck[],
  instances: BillInstance[],
  plan: PaycheckSyncPlan,
): { paychecks: Paycheck[]; instances: BillInstance[] } {
  const kept = paychecks.filter((row) => !plan.deleteIds.includes(row.id))
  const written = plan.upserts.map((seed) => paycheck(seed.pay_date, seed))
  const writtenIds = new Set(written.map((row) => row.id))
  return {
    paychecks: [...kept.filter((row) => !writtenIds.has(row.id)), ...written],
    instances: instances.map((row) =>
      row.paycheck_id && plan.deleteIds.includes(row.paycheck_id) ? { ...row, paycheck_id: null } : row,
    ),
  }
}

function applyAssignments(instances: BillInstance[], updates: InstanceAssignmentUpdate[]): BillInstance[] {
  const byId = new Map(updates.map((update) => [update.id, update]))
  return instances.map((row) => {
    const update = byId.get(row.id)
    if (!update) return row
    return { ...row, paycheck_id: update.paycheck_id, override: update.releaseOverride ? false : row.override }
  })
}

describe('planPaycheckSync — schedule', () => {
  it('creates a paycheck for every scheduled pay date that has none', () => {
    const plan = planPaycheckSync([source()], [], TODAY, HORIZON_END)
    expect(plan.upserts).toEqual(
      WEDNESDAYS.map((pay_date) => ({ income_source_id: 'src-1', pay_date, expected_amount: 3290 })),
    )
    expect(plan.deleteIds).toEqual([])
  })

  it('rewrites the expected amount of a paycheck that carries an old one', () => {
    const existing = [paycheck('2026-11-25', { expected_amount: 3000 }), ...real.slice(1)]
    const plan = planPaycheckSync([source()], existing, TODAY, HORIZON_END)
    expect(plan.upserts).toEqual([{ income_source_id: 'src-1', pay_date: '2026-11-25', expected_amount: 3290 }])
    expect(plan.deleteIds).toEqual([])
  })
})

describe('planPaycheckSync — stale paychecks', () => {
  it('removes the day-early Tuesday rows and keeps the real Wednesdays', () => {
    const plan = planPaycheckSync([source()], [...phantoms, ...real], TODAY, HORIZON_END)
    expect(plan.deleteIds).toEqual(TUESDAYS.map((date) => `pc-${date}`))
    expect(plan.upserts).toEqual([])
  })

  it('keeps a phantom that was actualized: it records money received', () => {
    const existing = [paycheck('2026-11-24', { actual_amount: 3290 }), ...phantoms.slice(1), ...real]
    const plan = planPaycheckSync([source()], existing, TODAY, HORIZON_END)
    expect(plan.deleteIds).not.toContain('pc-2026-11-24')
    expect(plan.deleteIds).toEqual(TUESDAYS.slice(1).map((date) => `pc-${date}`))
  })

  it('keeps an actualized phantom even when the amount received was zero', () => {
    const plan = planPaycheckSync([source()], [paycheck('2026-11-24', { actual_amount: 0 })], TODAY, HORIZON_END)
    expect(plan.deleteIds).toEqual([])
  })

  it('leaves past rows untouched, on schedule or not', () => {
    const past = [paycheck('2026-10-27'), paycheck('2026-11-10'), paycheck('2026-11-11'), paycheck('2026-11-15')]
    const plan = planPaycheckSync([source()], [...past, ...real], TODAY, HORIZON_END)
    expect(plan.deleteIds).toEqual([])
  })

  it('counts today as upcoming and leaves rows past the horizon alone', () => {
    const existing = [paycheck('2026-11-16'), paycheck('2027-02-16'), ...real]
    const plan = planPaycheckSync([source()], existing, TODAY, HORIZON_END)
    expect(plan.deleteIds).toEqual(['pc-2026-11-16'])
  })

  it('removes upcoming paychecks of a source that is inactive or gone, but not actualized ones', () => {
    const existing = [
      paycheck('2026-11-25'),
      paycheck('2026-12-09', { actual_amount: 3290 }),
      paycheck('2026-12-01', { id: 'pc-gone', income_source_id: 'src-deleted' }),
    ]
    const plan = planPaycheckSync([source({ active: false })], existing, TODAY, HORIZON_END)
    expect(plan.upserts).toEqual([])
    expect(plan.deleteIds).toEqual(['pc-2026-11-25', 'pc-gone'])
  })

  it('keeps hand-entered paychecks of an active irregular source', () => {
    const gig = source({ id: 'src-gig', schedule: 'irregular', anchor_date: null })
    const existing = [paycheck('2026-12-04', { id: 'pc-gig', income_source_id: 'src-gig', expected_amount: 400 })]
    expect(planPaycheckSync([gig], existing, TODAY, HORIZON_END)).toEqual({ upserts: [], deleteIds: [] })
    expect(planPaycheckSync([{ ...gig, active: false }], existing, TODAY, HORIZON_END).deleteIds).toEqual(['pc-gig'])
  })

  it('judges each source against its own schedule', () => {
    // A second job paid on the very Tuesdays that are phantoms for the first.
    const second = source({ id: 'src-2', anchor_date: '2026-10-13', net_amount: 900 })
    const theirs = TUESDAYS.map((date) => paycheck(date, { id: `pc2-${date}`, income_source_id: 'src-2', expected_amount: 900 }))
    const plan = planPaycheckSync([source(), second], [...phantoms, ...real, ...theirs], TODAY, HORIZON_END)
    expect(plan.deleteIds).toEqual(TUESDAYS.map((date) => `pc-${date}`))
    expect(plan.upserts).toEqual([])
  })
})

describe('paycheck cleanup + assignment in one sync pass', () => {
  const BUFFER_DAYS = 3
  const before = [...phantoms, ...real]

  // Where the rows sat while the phantoms existed: whatever the assignment made of them then.
  function assignedAsBefore(rows: BillInstance[]): BillInstance[] {
    const assignments = assignInstances(rows, before, BUFFER_DAYS)
    return rows.map((row) => ({ ...row, paycheck_id: assignments.get(row.id)?.paycheckId ?? null }))
  }

  const existing = [
    ...assignedAsBefore([
      // Due before the first payday in the window, so it sat on the earliest paycheck: the phantom.
      instance({ id: 'bi-early', due_date: '2026-11-19' }),
      // Due Friday Dec 11: three days of buffer lands exactly on the phantom Tuesday.
      instance({ id: 'bi-on-phantom', due_date: '2026-12-11' }),
      // Due Dec 31: the real Wednesday before it was always the right paycheck.
      instance({ id: 'bi-on-real', due_date: '2026-12-31' }),
    ]),
    instance({ id: 'bi-paid', due_date: '2026-12-11', bill_id: 'bill-2', status: 'paid', paycheck_id: 'pc-2026-12-08' }),
    instance({ id: 'bi-skipped', due_date: '2026-12-11', bill_id: 'bill-3', status: 'skipped', paycheck_id: 'pc-2026-12-08' }),
    instance({ id: 'bi-pinned-gone', due_date: '2026-12-28', bill_id: 'bill-4', override: true, paycheck_id: 'pc-2026-12-22' }),
    instance({ id: 'bi-pinned-kept', due_date: '2026-12-28', bill_id: 'bill-5', override: true, paycheck_id: 'pc-2026-11-25' }),
  ]

  const plan = planPaycheckSync([source()], before, TODAY, HORIZON_END)
  const cleaned = applyPaycheckPlan(before, existing, plan)
  const updates = planAssignmentUpdates(cleaned.instances, cleaned.paychecks, BUFFER_DAYS)
  const after = new Map(applyAssignments(cleaned.instances, updates).map((row) => [row.id, row]))

  it('starts from the broken state: bills sitting on phantom paychecks', () => {
    const start = new Map(existing.map((row) => [row.id, row.paycheck_id]))
    expect(start.get('bi-early')).toBe('pc-2026-11-24')
    expect(start.get('bi-on-phantom')).toBe('pc-2026-12-08')
    expect(start.get('bi-on-real')).toBe('pc-2026-12-23')
  })

  it('leaves only the real paychecks', () => {
    expect(cleaned.paychecks.map((row) => row.pay_date).sort()).toEqual(WEDNESDAYS)
  })

  it('moves freed planned instances onto the correct paycheck in the same pass', () => {
    expect(after.get('bi-early')?.paycheck_id).toBe('pc-2026-11-25')
    expect(after.get('bi-on-phantom')?.paycheck_id).toBe('pc-2026-11-25')
    expect(updates.filter((update) => !update.releaseOverride).map((update) => update.id)).toEqual([
      'bi-early',
      'bi-on-phantom',
    ])
  })

  it('does not move an instance that was already on a real paycheck', () => {
    expect(after.get('bi-on-real')?.paycheck_id).toBe('pc-2026-12-23')
    expect(updates.map((update) => update.id)).not.toContain('bi-on-real')
  })

  it('leaves paid and skipped instances as they are, now unassigned', () => {
    expect(after.get('bi-paid')).toMatchObject({ status: 'paid', paycheck_id: null })
    expect(after.get('bi-skipped')).toMatchObject({ status: 'skipped', paycheck_id: null })
    expect(updates.map((update) => update.id)).not.toContain('bi-paid')
    expect(updates.map((update) => update.id)).not.toContain('bi-skipped')
  })

  it('releases an override whose paycheck is gone and keeps one whose paycheck survived', () => {
    expect(after.get('bi-pinned-gone')).toMatchObject({ override: false, paycheck_id: 'pc-2026-12-23' })
    expect(after.get('bi-pinned-kept')).toMatchObject({ override: true, paycheck_id: 'pc-2026-11-25' })
  })

  it('leaves no instance pointing at a paycheck that no longer exists', () => {
    const ids = new Set(cleaned.paychecks.map((row) => row.id))
    for (const row of after.values()) {
      if (row.paycheck_id !== null) expect(ids.has(row.paycheck_id)).toBe(true)
    }
  })

  it('is stable: a second sync has nothing left to do', () => {
    expect(planPaycheckSync([source()], cleaned.paychecks, TODAY, HORIZON_END)).toEqual({ upserts: [], deleteIds: [] })
    expect(planAssignmentUpdates([...after.values()], cleaned.paychecks, BUFFER_DAYS)).toEqual([])
  })

  it('a kept, actualized phantom still holds its bills', () => {
    const paid = before.map((row) => (row.id === 'pc-2026-12-08' ? { ...row, actual_amount: 3290 } : row))
    const kept = applyPaycheckPlan(paid, existing, planPaycheckSync([source()], paid, TODAY, HORIZON_END))
    expect(kept.paychecks.map((row) => row.id)).toContain('pc-2026-12-08')
    expect(kept.instances.find((row) => row.id === 'bi-paid')?.paycheck_id).toBe('pc-2026-12-08')
  })
})
