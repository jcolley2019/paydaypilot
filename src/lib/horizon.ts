import { supabase } from '@/lib/supabase'
import { planAssignmentUpdates, planAutopayMarks, planInstanceSync, planPaycheckSync } from '@/lib/horizonPlan'
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

/**
 * Planned, not-held instances of the given bills due on or before `to` — past dates included,
 * so an autopay bill whose due date slipped by while the app was closed still gets marked.
 */
async function fetchAutopayCandidates(userId: string, billIds: string[], to: string): Promise<BillInstance[]> {
  if (billIds.length === 0) return []
  const { data, error } = await supabase
    .from('bill_instances')
    .select('*')
    .eq('user_id', userId)
    .in('bill_id', billIds)
    .eq('status', 'planned')
    .eq('autopay_hold', false)
    .lte('due_date', to)
  if (error) throw error
  return (data ?? []) as BillInstance[]
}

/**
 * The paychecks among `paycheckIds` that a bucket deposit was logged against. The deposit is a
 * record of money that moved, so its paycheck is kept even when it is off schedule.
 */
async function fetchFundedPaycheckIds(paycheckIds: string[]): Promise<Set<string>> {
  if (paycheckIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('bucket_entries')
    .select('paycheck_id')
    .in('paycheck_id', paycheckIds)
  if (error) throw error
  return new Set((data ?? []).map((entry) => entry.paycheck_id as string))
}

export async function syncHorizon(userId: string): Promise<void> {
  const today = new Date()
  const horizonEnd = addDays(today, HORIZON_DAYS)
  const from = toISODate(today)
  const to = toISODate(horizonEnd)

  const [bufferDays, incomeSources, activeBills, existingInstances, existingPaychecks] = await Promise.all([
    fetchBufferDays(userId),
    fetchActiveIncomeSources(userId),
    fetchActiveBills(userId),
    fetchInstances(userId, from, to),
    fetchPaychecks(userId, from, to),
  ])

  const paycheckPlan = planPaycheckSync(incomeSources, existingPaychecks, today, horizonEnd)

  if (paycheckPlan.upserts.length > 0) {
    const { error } = await supabase
      .from('paychecks')
      .upsert(
        paycheckPlan.upserts.map((row) => ({ user_id: userId, ...row })),
        { onConflict: 'income_source_id,pay_date' },
      )
    if (error) throw error
  }

  // Stale paychecks go before anything is assigned: deleting one empties paycheck_id on its
  // instances (ON DELETE SET NULL), and the assignment pass at the end re-homes them. The
  // date and actual_amount filters repeat the plan's own rules, so a paycheck that was
  // actualized since the fetch above is still left alone.
  const fundedPaycheckIds = await fetchFundedPaycheckIds(paycheckPlan.deleteIds)
  const stalePaycheckIds = paycheckPlan.deleteIds.filter((id) => !fundedPaycheckIds.has(id))
  if (stalePaycheckIds.length > 0) {
    const { error } = await supabase
      .from('paychecks')
      .delete()
      .in('id', stalePaycheckIds)
      .eq('user_id', userId)
      .gte('pay_date', from)
      .is('actual_amount', null)
    if (error) throw error
  }

  const plan = planInstanceSync(activeBills, existingInstances, today, horizonEnd)

  // The status/override filters repeat the plan's own rules, so a row that was marked paid
  // or pinned to a paycheck since the fetch above is still left alone.
  if (plan.deleteIds.length > 0) {
    const { error } = await supabase
      .from('bill_instances')
      .delete()
      .in('id', plan.deleteIds)
      .eq('status', 'planned')
      .eq('override', false)
    if (error) throw error
  }

  const idsByAmount = new Map<number, string[]>()
  for (const { id, amount } of plan.amountUpdates) {
    idsByAmount.set(amount, [...(idsByAmount.get(amount) ?? []), id])
  }
  for (const [amount, ids] of idsByAmount) {
    const { error } = await supabase
      .from('bill_instances')
      .update({ amount })
      .in('id', ids)
      .eq('status', 'planned')
    if (error) throw error
  }

  if (plan.inserts.length > 0) {
    const { error } = await supabase
      .from('bill_instances')
      .upsert(
        plan.inserts.map((row) => ({ user_id: userId, ...row })),
        { onConflict: 'bill_id,due_date', ignoreDuplicates: true },
      )
    if (error) throw error
  }

  const [paychecks, instances] = await Promise.all([
    fetchPaychecks(userId, from, to),
    fetchInstances(userId, from, to),
  ])

  for (const update of planAssignmentUpdates(instances, paychecks, bufferDays)) {
    const { error } = await supabase
      .from('bill_instances')
      .update(
        update.releaseOverride
          ? { paycheck_id: update.paycheck_id, override: false }
          : { paycheck_id: update.paycheck_id },
      )
      .eq('id', update.id)
    if (error) throw error
  }

  // Autopay runs last. Paid instances are never reassigned, so marking one before the
  // assignment pass would leave an instance created today, and due today, with no paycheck.
  // The status/hold filters repeat the plan's own rules, so an instance the user marked or
  // undid since the fetch is still left alone.
  const autopayBillIds = activeBills.filter((bill) => bill.autopay).map((bill) => bill.id)
  const candidates = await fetchAutopayCandidates(userId, autopayBillIds, from)
  const idsByPaidAt = new Map<string, string[]>()
  for (const { id, paid_at } of planAutopayMarks(candidates, activeBills, today)) {
    idsByPaidAt.set(paid_at, [...(idsByPaidAt.get(paid_at) ?? []), id])
  }
  for (const [paidAt, ids] of idsByPaidAt) {
    const { error } = await supabase
      .from('bill_instances')
      .update({ status: 'paid', paid_at: paidAt, paid_source: 'autopay' })
      .in('id', ids)
      .eq('status', 'planned')
      .eq('autopay_hold', false)
    if (error) throw error
  }
}
