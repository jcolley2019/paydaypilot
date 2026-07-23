import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { syncHorizon } from '@/lib/horizon'
import type { IncomeSource, IncomeSourceInsert, IncomeSourceUpdate } from '@/types/payday'

export function useIncomeSources() {
  const { user } = useAuth()
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([])
  const [loading, setLoading] = useState(true)

  const fetchIncomeSources = useCallback(async () => {
    if (!user) {
      setIncomeSources([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('income_sources')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true })
    if (error) {
      toast.error(`Failed to load income: ${error.message}`)
    } else {
      setIncomeSources((data ?? []) as IncomeSource[])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchIncomeSources()
  }, [fetchIncomeSources])

  async function resync() {
    if (!user) return
    await syncHorizon(user.id)
  }

  async function createIncomeSource(source: IncomeSourceInsert) {
    if (!user) return
    const { error } = await supabase
      .from('income_sources')
      .insert({ ...source, user_id: user.id })
    if (error) {
      toast.error(`Failed to add income: ${error.message}`)
      return
    }
    toast.success('Income source added')
    await fetchIncomeSources()
    await resync()
  }

  async function updateIncomeSource(id: string, updates: IncomeSourceUpdate) {
    if (!user) return
    const { error } = await supabase
      .from('income_sources')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) {
      toast.error(`Failed to update income: ${error.message}`)
      return
    }
    toast.success('Income source updated')
    await fetchIncomeSources()
    await resync()
  }

  async function deleteIncomeSource(id: string) {
    if (!user) return
    const { error } = await supabase
      .from('income_sources')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) {
      toast.error(`Failed to delete income: ${error.message}`)
      return
    }
    toast.success('Income source deleted')
    await fetchIncomeSources()
    await resync()
  }

  async function toggleActive(id: string, active: boolean) {
    await updateIncomeSource(id, { active })
  }

  async function addManualPaycheck(incomeSourceId: string, payDate: string, amount: number) {
    if (!user) return
    const { error } = await supabase.from('paychecks').insert({
      user_id: user.id,
      income_source_id: incomeSourceId,
      pay_date: payDate,
      expected_amount: amount,
    })
    if (error) {
      toast.error(`Failed to add paycheck: ${error.message}`)
      return
    }
    toast.success('Paycheck added')
    await resync()
  }

  return {
    incomeSources,
    loading,
    createIncomeSource,
    updateIncomeSource,
    deleteIncomeSource,
    toggleActive,
    addManualPaycheck,
    refresh: fetchIncomeSources,
  }
}
