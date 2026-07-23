import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
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
    await fetchBills()
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
    await fetchBills()
  }

  async function toggleActive(id: string, active: boolean) {
    await updateBill(id, { active })
  }

  return { bills, loading, createBill, updateBill, deleteBill, toggleActive, refresh: fetchBills }
}
