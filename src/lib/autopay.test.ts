import { describe, it, expect } from 'vitest'
import { planAutopayMarks } from './horizonPlan'
import type { Bill } from '@/types/bills'
import type { BillInstance } from '@/types/payday'

type AutopayBill = Pick<Bill, 'id' | 'autopay'>

// Mid-afternoon local time, so a mark built from "now" would not land on noon.
const TODAY = new Date(2026, 10, 16, 15, 30)

const AUTOPAY_BILL: AutopayBill = { id: 'bill-1', autopay: true }

function noonOn(year: number, month0: number, day: number): string {
  return new Date(year, month0, day, 12).toISOString()
}

function instance(overrides: Partial<BillInstance>): BillInstance {
  return {
    id: 'bi-1',
    user_id: 'user-1',
    bill_id: 'bill-1',
    due_date: '2026-11-16',
    amount: 100,
    paycheck_id: null,
    override: false,
    status: 'planned',
    paid_at: null,
    paid_source: null,
    autopay_hold: false,
    ...overrides,
  }
}

describe('planAutopayMarks', () => {
  it('marks an autopay instance due today, paid at noon on its due date', () => {
    expect(planAutopayMarks([instance({})], [AUTOPAY_BILL], TODAY)).toEqual([
      { id: 'bi-1', paid_at: noonOn(2026, 10, 16) },
    ])
  })

  it('marks an instance due yesterday with paid_at on the due date, not today', () => {
    const marks = planAutopayMarks([instance({ due_date: '2026-11-15' })], [AUTOPAY_BILL], TODAY)
    expect(marks).toEqual([{ id: 'bi-1', paid_at: noonOn(2026, 10, 15) }])
  })

  it('does not mark an instance due tomorrow', () => {
    expect(planAutopayMarks([instance({ due_date: '2026-11-17' })], [AUTOPAY_BILL], TODAY)).toEqual([])
  })

  it('does not mark an instance of a bill without autopay', () => {
    expect(planAutopayMarks([instance({})], [{ id: 'bill-1', autopay: false }], TODAY)).toEqual([])
  })

  it('does not mark an instance the user undid (autopay_hold)', () => {
    expect(planAutopayMarks([instance({ autopay_hold: true })], [AUTOPAY_BILL], TODAY)).toEqual([])
  })

  it('does not touch an instance that is already paid or skipped', () => {
    const existing = [
      instance({ id: 'bi-paid', status: 'paid', paid_at: noonOn(2026, 10, 14), paid_source: 'manual' }),
      instance({ id: 'bi-skipped', status: 'skipped' }),
    ]
    expect(planAutopayMarks(existing, [AUTOPAY_BILL], TODAY)).toEqual([])
  })

  it('does not mark an instance whose bill is missing from the active list', () => {
    expect(planAutopayMarks([instance({ bill_id: 'bill-gone' })], [AUTOPAY_BILL], TODAY)).toEqual([])
  })
})
