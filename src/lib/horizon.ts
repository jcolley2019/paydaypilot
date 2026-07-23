import { supabase } from '@/lib/supabase'
import { generatePayDates, occurrencesForBill } from '@/lib/paydays'
import { assignInstances } from '@/lib/assignment'
import { addDays, toISODate } from '@/lib/localDate'
import type { Bill } from '@/types/bills'
import type { BillInstance, IncomeSource, Paycheck } from '@/types/payday'

const HORIZON_DAYS = 90
const DEFAULT_BUFFER_DAYS = 3

async function fetchBufferDays(userId: string): Promise<number> {
  const { data } = await supabase
    .from('profiles')
    .select('buffer_days')
    .eq('id', userId)
    .single()
  return data?.buffer_days ?? DEFAULT_BUFFER_DAYS
}

async function fetchActiveIncomeSources(userId: string): Promise<IncomeSource[]> {
  const { data, error } = await supabase
    .from('income_sources')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
  if (error) throw error
  return (data ?? []) as IncomeSource[]
}

async function fetchActiveBills(userId: string): Promise<Bill[]> {
  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
  if (error) throw error
  return (data ?? []) as Bill[]
}

async function fetchPaychecks(userId: string, from: string, to: string): Promise<Paycheck[]> {
  const { data, error } = await supabase
    .from('paychecks')
    .select('*')
    .eq('user_id', userId)
    .gte('pay_date', from)
    .lte('pay_date', to)
  if (error) throw error
  return (data ?? []) as Paycheck[]
}

async function fetchInstances(userId: string, from: string, to: string): Promise<BillInstance[]> {
  const { data, error } = await supabase
    .from('bill_instances')
    .select('*')
    .eq('user_id', userId)
    .gte('due_date', from)
    .lte('due_date', to)
  if (error) throw error
  return (data ?? []) as BillInstance[]
}

export async function syncHorizon(userId: string): Promise<void> {
  const today = new Date()
  const from = toISODate(today)
  const to = toISODate(addDays(today, HORIZON_DAYS))

  const [bufferDays, incomeSources, activeBills] = await Promise.all([
    fetchBufferDays(userId),
    fetchActiveIncomeSources(userId),
    fetchActiveBills(userId),
  ])

  const paycheckRows = incomeSources.flatMap((source) =>
    generatePayDates(source, today, addDays(today, HORIZON_DAYS)).map((date) => ({
      user_id: userId,
      income_source_id: source.id,
      pay_date: toISODate(date),
      expected_amount: source.net_amount,
    })),
  )

  if (paycheckRows.length > 0) {
    const { error } = await supabase
      .from('paychecks')
      .upsert(paycheckRows, { onConflict: 'income_source_id,pay_date' })
    if (error) throw error
  }

  const instanceRows = activeBills.flatMap((bill) =>
    occurrencesForBill(bill, today, addDays(today, HORIZON_DAYS)).map((date) => ({
      user_id: userId,
      bill_id: bill.id,
      due_date: toISODate(date),
      amount: bill.amount,
    })),
  )

  if (instanceRows.length > 0) {
    const { error } = await supabase
      .from('bill_instances')
      .upsert(instanceRows, { onConflict: 'bill_id,due_date', ignoreDuplicates: true })
    if (error) throw error
  }

  const [paychecks, instances] = await Promise.all([
    fetchPaychecks(userId, from, to),
    fetchInstances(userId, from, to),
  ])

  const assignments = assignInstances(instances, paychecks, bufferDays)
  for (const instance of instances) {
    if (instance.override || instance.status === 'paid') continue
    const assignment = assignments.get(instance.id)
    if (!assignment) continue
    if (assignment.paycheckId !== instance.paycheck_id) {
      const { error } = await supabase
        .from('bill_instances')
        .update({ paycheck_id: assignment.paycheckId })
        .eq('id', instance.id)
      if (error) throw error
    }
  }

  const activeBillIds = new Set(activeBills.map((bill) => bill.id))
  const staleIds = instances
    .filter(
      (instance) =>
        instance.status === 'planned' &&
        !instance.override &&
        instance.due_date >= from &&
        !activeBillIds.has(instance.bill_id),
    )
    .map((instance) => instance.id)

  if (staleIds.length > 0) {
    const { error } = await supabase.from('bill_instances').delete().in('id', staleIds)
    if (error) throw error
  }
}
