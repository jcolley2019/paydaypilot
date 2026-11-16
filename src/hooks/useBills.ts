import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { requestHorizonSync } from '@/lib/horizonSync'
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

  /** Adds several bills in one insert (all or nothing); true when they were saved. */
  async function createBills(newBills: BillInsert[]): Promise<boolean> {
    if (!user || newBills.length === 0) return false
    const { error } = await supabase
      .from('bills')
      .insert(newBills.map((bill) => ({ ...bill, user_id: user.id })))
    if (error) {
      toast.error(`Failed to add bills: ${error.message}`)
      return false
    }
    toast.success(newBills.length === 1 ? 'Bill added' : `${newBills.length} bills added`)
    syncPlan(user.id)
    await fetchBills()
    return true
  }

  async function updateBill(id: string, updates: BillUpdate) {
    if (!user) return
    const { error } = await supabase
      .from('bills')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) {
      toast.error(`Failed to update bill: ${error.message}`)
      return
    }
    toast.success('Bill updated')
    syncPlan(user.id)
    await fetchBills()
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

  return { bills, loading, createBill, createBills, updateBill, deleteBill, toggleActive, refresh: fetchBills }
}
