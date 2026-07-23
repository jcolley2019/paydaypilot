import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toISODate } from '@/lib/localDate'
import type { Bucket, BucketEntry, BucketInsert, BucketUpdate } from '@/types/buckets'

export function useBuckets() {
  const { user } = useAuth()
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [entries, setEntries] = useState<BucketEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!user) {
      setBuckets([])
      setEntries([])
      setLoading(false)
      return
    }
    setLoading(true)
    const [bucketRes, entryRes] = await Promise.all([
      supabase
        .from('buckets')
        .select('*')
        .eq('user_id', user.id)
        .order('sort', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('bucket_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ])
    if (bucketRes.error || entryRes.error) {
      const message = bucketRes.error?.message ?? entryRes.error?.message ?? 'Unknown error'
      toast.error(`Failed to load buckets: ${message}`)
    } else {
      setBuckets((bucketRes.data ?? []) as Bucket[])
      setEntries((entryRes.data ?? []) as BucketEntry[])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function createBucket(bucket: BucketInsert) {
    if (!user) return
    const { error } = await supabase
      .from('buckets')
      .insert({ ...bucket, user_id: user.id, current_balance: 0 })
    if (error) {
      toast.error(`Failed to add bucket: ${error.message}`)
      return
    }
    toast.success('Bucket added')
    await fetchAll()
  }

  async function updateBucket(id: string, updates: BucketUpdate) {
    if (!user) return
    const { error } = await supabase
      .from('buckets')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) {
      toast.error(`Failed to update bucket: ${error.message}`)
      return
    }
    toast.success('Bucket updated')
    await fetchAll()
  }

  async function deactivateBucket(id: string) {
    await updateBucket(id, { active: false })
  }

  async function deleteBucket(id: string) {
    if (!user) return
    const { error } = await supabase
      .from('buckets')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) {
      toast.error(`Failed to delete bucket: ${error.message}`)
      return
    }
    toast.success('Bucket deleted')
    await fetchAll()
  }

  async function addEntry(bucketId: string, amount: number, note?: string, paycheckId?: string) {
    if (!user) return
    const bucket = buckets.find((b) => b.id === bucketId)
    if (!bucket) return
    if (bucket.current_balance + amount < 0) {
      toast.error("Withdrawal would take the balance below zero.")
      return
    }

    const { data: inserted, error: insertError } = await supabase
      .from('bucket_entries')
      .insert({
        user_id: user.id,
        bucket_id: bucketId,
        paycheck_id: paycheckId ?? null,
        amount,
        entry_date: toISODate(new Date()),
        note: note?.trim() || null,
      })
      .select()
      .single()

    if (insertError) {
      toast.error(`Failed to log entry: ${insertError.message}`)
      return
    }

    const { error: balanceError } = await supabase
      .from('buckets')
      .update({ current_balance: bucket.current_balance + amount })
      .eq('id', bucketId)
      .eq('user_id', user.id)

    if (balanceError) {
      await supabase.from('bucket_entries').delete().eq('id', inserted.id)
      toast.error(`Failed to update balance: ${balanceError.message}`)
      return
    }

    toast.success(amount >= 0 ? 'Deposit logged' : 'Withdrawal logged')
    await fetchAll()
  }

  return {
    buckets,
    entries,
    loading,
    createBucket,
    updateBucket,
    deactivateBucket,
    deleteBucket,
    addEntry,
    refresh: fetchAll,
  }
}
