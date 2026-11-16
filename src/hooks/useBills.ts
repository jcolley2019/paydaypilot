import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { requestHorizonSync } from '@/lib/horizonSync'
import { batchSummary } from '@/lib/importActions'
import type { Bill, BillInsert, BillUpdate } from '@/types/bills'

export function useBills() {
  const { user } = useAuth()
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)

  const fetchBills = useCallback(async () => {
    if (!user) {
      setBills([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('bills')
      .select('*')
      .eq('user_id', user.id)
    if (error) {
      toast.error(`Failed to load bills: ${error.message}`)
    } else {
      setBills((data ?? []) as Bill[])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchBills()
  }, [fetchBills])

  /**
   * Bills drive the generated instances, so each saved change re-syncs the payday plan —
   * once per change, however many bills it touched. It runs in the background: the bill is
   * already saved, and anything showing the plan reloads when the sync lands.
   */
  function syncPlan(userId: string) {
    requestHorizonSync(userId).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Saved, but the payday plan didn't update: ${message}`)
    })
  }

  async function createBill(bill: BillInsert) {
    if (!user) return
    const { error } = await supabase
      .from('bills')
      .insert({ ...bill, user_id: user.id })
    if (error) {
      toast.error(`Failed to add bill: ${error.message}`)
      return
    }
    toast.success('Bill added')
    syncPlan(user.id)
    await fetchBills()
  }

  /**
   * Adds several bills in one insert (all or nothing); true when they were saved.
   * `quiet` leaves the toast, sync, and reload to a caller batching several writes.
   */
  async function createBills(newBills: BillInsert[], { quiet = false } = {}): Promise<boolean> {
    if (!user || newBills.length === 0) return false
    const { error } = await supabase
      .from('bills')
      .insert(newBills.map((bill) => ({ ...bill, user_id: user.id })))
    if (error) {
      toast.error(`Failed to add bills: ${error.message}`)
      return false
    }
    if (quiet) return true
    toast.success(newBills.length === 1 ? 'Bill added' : `${newBills.length} bills added`)
    syncPlan(user.id)
    await fetchBills()
    return true
  }

  /** True when saved; `quiet` as for createBills. */
  async function updateBill(id: string, updates: BillUpdate, { quiet = false } = {}): Promise<boolean> {
    if (!user) return false
    const { error } = await supabase
      .from('bills')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) {
      toast.error(`Failed to update bill: ${error.message}`)
      return false
    }
    if (quiet) return true
    toast.success('Bill updated')
    syncPlan(user.id)
    await fetchBills()
    return true
  }

  /**
   * An import batch: updates first, then the inserts, then one sync for the lot. Updates go
   * first because re-running them is harmless — after any failure the user can retry the
   * whole batch without duplicating bills. True when everything was saved.
   */
  async function importBills(
    inserts: BillInsert[],
    updates: { id: string; updates: BillUpdate }[],
  ): Promise<boolean> {
    if (!user || (inserts.length === 0 && updates.length === 0)) return false
    const results = await Promise.all(updates.map((entry) => updateBill(entry.id, entry.updates, { quiet: true })))
    const updated = results.filter(Boolean).length
    const updatesOk = updated === updates.length
    const added = updatesOk && inserts.length > 0 && (await createBills(inserts, { quiet: true })) ? inserts.length : 0
    if (added + updated > 0) {
      syncPlan(user.id)
      await fetchBills()
    }
    const ok = updatesOk && added === inserts.length
    if (ok) toast.success(batchSummary(added, updated))
    return ok
  }

  async function deleteBill(id: string) {
    if (!user) return
    const { error } = await supabase
      .from('bills')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) {
      toast.error(`Failed to delete bill: ${error.message}`)
      return
    }
    toast.success('Bill deleted')
    syncPlan(user.id)
    await fetchBills()
  }

  async function toggleActive(id: string, active: boolean) {
    await updateBill(id, { active })
  }

  return {
    bills,
    loading,
    createBill,
    createBills,
    updateBill,
    importBills,
    deleteBill,
    toggleActive,
    refresh: fetchBills,
  }
}
