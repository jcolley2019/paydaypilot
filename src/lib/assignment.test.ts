import { describe, it, expect } from 'vitest'
import { assignInstances, paycheckLoad } from './assignment'
import type { BillInstance, Paycheck } from '@/types/payday'

function paycheck(overrides: Partial<Paycheck>): Paycheck {
  return {
    id: 'pc-1',
    user_id: 'user-1',
    income_source_id: 'src-1',
    pay_date: '2026-07-03',
    expected_amount: 1000,
    actual_amount: null,
    ...overrides,
  }
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

describe('assignInstances', () => {
  it('assigns a bill due 5 days after payday to that payday when buffer is 3', () => {
    const pc = paycheck({ id: 'pc-a', pay_date: '2026-07-03' })
    const bi = instance({ id: 'bi-a', due_date: '2026-07-08' })
    const result = assignInstances([bi], [pc], 3)
    expect(result.get('bi-a')).toEqual({ paycheckId: 'pc-a', alert: 'none' })
  })

  it('assigns a bill due 2 days after payday to the PREVIOUS payday when buffer is 3', () => {
    const previous = paycheck({ id: 'pc-prev', pay_date: '2026-06-19' })
    const current = paycheck({ id: 'pc-cur', pay_date: '2026-07-03' })
    const bi = instance({ id: 'bi-b', due_date: '2026-07-05' })
    const result = assignInstances([bi], [previous, current], 3)
    expect(result.get('bi-b')).toEqual({ paycheckId: 'pc-prev', alert: 'none' })
  })

  it('flags a bill due before all paychecks and assigns the earliest one', () => {
    const first = paycheck({ id: 'pc-first', pay_date: '2026-07-10' })
    const second = paycheck({ id: 'pc-second', pay_date: '2026-07-24' })
    const bi = instance({ id: 'bi-c', due_date: '2026-07-01' })
    const result = assignInstances([bi], [second, first], 3)
    expect(result.get('bi-c')).toEqual({ paycheckId: 'pc-first', alert: 'due_before_payday' })
  })

  it('leaves override instances untouched', () => {
    const pc = paycheck({ id: 'pc-a', pay_date: '2026-07-03' })
    const bi = instance({
      id: 'bi-override',
      due_date: '2026-07-01',
      override: true,
      paycheck_id: 'pc-manual',
    })
    const result = assignInstances([bi], [pc], 3)
    expect(result.get('bi-override')).toEqual({ paycheckId: 'pc-manual', alert: 'none' })
  })

  it('leaves paid instances untouched', () => {
    const pc = paycheck({ id: 'pc-a', pay_date: '2026-07-03' })
    const bi = instance({
      id: 'bi-paid',
      due_date: '2026-07-01',
      status: 'paid',
      paycheck_id: 'pc-old',
    })
    const result = assignInstances([bi], [pc], 3)
    expect(result.get('bi-paid')).toEqual({ paycheckId: 'pc-old', alert: 'none' })
  })

  it('assigns paycheckId null with no alert when there are no paychecks at all', () => {
    const bi = instance({ id: 'bi-none' })
    const result = assignInstances([bi], [], 3)
    expect(result.get('bi-none')).toEqual({ paycheckId: null, alert: 'none' })
  })
})

describe('paycheckLoad', () => {
  const pc = paycheck({ expected_amount: 500 })

  it('computes bill total and remaining', () => {
    const instances = [instance({ amount: 100 }), instance({ id: 'bi-2', amount: 150 })]
    const load = paycheckLoad(pc, instances)
    expect(load).toEqual({ billTotal: 250, remaining: 250, oversubscribed: false })
  })

  it('is not oversubscribed when bill total exactly equals expected amount', () => {
    const instances = [instance({ amount: 500 })]
    const load = paycheckLoad(pc, instances)
    expect(load).toEqual({ billTotal: 500, remaining: 0, oversubscribed: false })
  })

  it('is oversubscribed when bill total exceeds expected amount', () => {
    const instances = [instance({ amount: 600 })]
    const load = paycheckLoad(pc, instances)
    expect(load).toEqual({ billTotal: 600, remaining: -100, oversubscribed: true })
  })
})
