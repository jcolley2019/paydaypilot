import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { onHorizonSynced, requestHorizonSync } from '@/lib/horizonSync'
import { assignInstances } from '@/lib/assignment'
import { addDays, toISODate } from '@/lib/localDate'
import type { BillInstance, InstanceAlert, Paycheck } from '@/types/payday'

const HORIZON_DAYS = 90
const DEFAULT_BUFFER_DAYS = 3
const syncedUserIds = new Set<string>()

export interface PaycheckWithSource extends Paycheck {
  sourceName: string
}

export interface BillInstanceWithBill extends BillInstance {
  billName: string
  alert: InstanceAlert
}

export function usePaydayEngine() {
  const { user, profile } = useAuth()
  const [paychecks, setPaychecks] = useState<PaycheckWithSource[]>([])
  const [instances, setInstances] = useState<BillInstanceWithBill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadSeq = useRef(0)

  const load = useCallback(async () => {
    // Every call fetches and the latest one wins: a load asked for while another is in flight
    // (a sync just landed, a bill was marked paid) must not be answered with the older read.
    const seq = ++loadSeq.current
    if (!user) {
      setPaychecks([])
      setInstances([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    const today = new Date()
    const from = toISODate(today)
    const to = toISODate(addDays(today, HORIZON_DAYS))

    const [paycheckRes, instanceRes] = await Promise.all([
      supabase
        .from('paychecks')
        .select('*, income_sources(name)')
        .eq('user_id', user.id)
        .gte('pay_date', from)
        .lte('pay_date', to)
        .order('pay_date', { ascending: true }),
      supabase
        .from('bill_instances')
        .select('*, bills(name)')
        .eq('user_id', user.id)
        .gte('due_date', from)
        .lte('due_date', to)
        .order('due_date', { ascending: true }),
    ])

    if (seq !== loadSeq.current) return

    if (paycheckRes.error || instanceRes.error) {
      const message = paycheckRes.error?.message ?? instanceRes.error?.message ?? 'Unknown error'
      setError(message)
      toast.error(`Failed to load payday plan: ${message}`)
      setLoading(false)
      return
    }

    type RawPaycheck = Paycheck & { income_sources: { name: string } | null }
    type RawInstance = BillInstance & { bills: { name: string } | null }

    const rawPaychecks = (paycheckRes.data ?? []) as RawPaycheck[]
    const rawInstances = (instanceRes.data ?? []) as RawInstance[]

    const bufferDays = profile?.buffer_days ?? DEFAULT_BUFFER_DAYS
    const assignments = assignInstances(rawInstances, rawPaychecks, bufferDays)

    setPaychecks(
      rawPaychecks.map((pc) => ({ ...pc, sourceName: pc.income_sources?.name ?? 'Income' })),
    )
    setInstances(
      rawInstances.map((instance) => ({
        ...instance,
        billName: instance.bills?.name ?? 'Bill',
        alert: assignments.get(instance.id)?.alert ?? 'none',
      })),
    )

    setLoading(false)
  }, [user, profile])

  const refresh = useCallback(async () => {
    await load()
  }, [load])

  const resync = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      // On success the subscription below does the reload.
      await requestHorizonSync(user.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      toast.error(`Failed to sync payday plan: ${message}`)
      await load()
    }
  }, [user, load])

  // Any sync — this hook's own, or one a bill change kicked off from another page or
  // component — means the rows on screen may be out of date.
  useEffect(() => {
    if (!user) return
    return onHorizonSynced((userId) => {
      if (userId === user.id) void load()
    })
  }, [user, load])

  useEffect(() => {
    // Intentionally keyed on `user` only — resyncing on every load/resync identity
    // change would defeat the once-per-session guard below.
    if (!user) {
      setLoading(false)
      return
    }
    if (syncedUserIds.has(user.id)) {
      load()
      return
    }
    syncedUserIds.add(user.id)
    resync()
  }, [user])

  async function markPaid(instanceId: string) {
    const { error } = await supabase
      .from('bill_instances')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', instanceId)
    if (error) {
      toast.error(`Failed to mark as paid: ${error.message}`)
      return
    }
    await refresh()
  }

  async function markUnpaid(instanceId: string) {
    const { error } = await supabase
      .from('bill_instances')
      .update({ status: 'planned', paid_at: null })
      .eq('id', instanceId)
    if (error) {
      toast.error(`Failed to revert: ${error.message}`)
      return
    }
    await refresh()
  }

  async function reassign(instanceId: string, paycheckId: string) {
    const { error } = await supabase
      .from('bill_instances')
      .update({ paycheck_id: paycheckId, override: true })
      .eq('id', instanceId)
    if (error) {
      toast.error(`Failed to reassign: ${error.message}`)
      return
    }
    await refresh()
  }

  return {
    paychecks,
    instances,
    loading,
    error,
    refresh,
    resync,
    markPaid,
    markUnpaid,
    reassign,
  }
}
