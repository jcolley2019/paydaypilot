import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useBuckets } from '@/hooks/useBuckets'
import { usePaydayEngine } from '@/hooks/usePaydayEngine'
import { BucketCard } from '@/components/buckets/BucketCard'
import { BucketFormDialog } from '@/components/buckets/BucketFormDialog'
import { BucketEntryDialog } from '@/components/buckets/BucketEntryDialog'
import type { Bucket, BucketInsert } from '@/types/buckets'

function sortBuckets(buckets: Bucket[]): Bucket[] {
  return [...buckets].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    return a.sort - b.sort
  })
}

export function Buckets() {
  const { buckets, entries, loading, createBucket, updateBucket, deleteBucket, addEntry } =
    useBuckets()
  const { paychecks } = usePaydayEngine()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null)
  const [entryDialog, setEntryDialog] = useState<{ bucket: Bucket; mode: 'deposit' | 'withdraw' } | null>(
    null,
  )

  const sorted = useMemo(() => sortBuckets(buckets), [buckets])
  const nextSort = useMemo(
    () => buckets.reduce((max, b) => Math.max(max, b.sort), 0) + 1,
    [buckets],
  )

  function openAddDialog() {
    setEditingBucket(null)
    setDialogOpen(true)
  }

  function openEditDialog(bucket: Bucket) {
    setEditingBucket(bucket)
    setDialogOpen(true)
  }

  async function handleSubmit(values: BucketInsert) {
    if (editingBucket) {
      await updateBucket(editingBucket.id, values)
    } else {
      await createBucket(values)
    }
  }

  function paychecksUntilTarget(targetDate: string | null): number {
    if (!targetDate) return 0
    return paychecks.filter((p) => p.pay_date <= targetDate).length
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Buckets</h1>
          <p className="text-sm text-muted-foreground">Savings goals, funded from every paycheck.</p>
        </div>
        <Button type="button" onClick={openAddDialog}>
          <Plus className="size-4" />
          Add bucket
        </Button>
      </div>

      {!loading && sorted.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Create your first savings bucket</CardTitle>
            <CardDescription>An emergency fund is a great start.</CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((bucket) => (
          <BucketCard
            key={bucket.id}
            bucket={bucket}
            entries={entries}
            paychecksUntilTarget={paychecksUntilTarget(bucket.target_date)}
            onEdit={openEditDialog}
            onDelete={deleteBucket}
            onDeposit={(b) => setEntryDialog({ bucket: b, mode: 'deposit' })}
            onWithdraw={(b) => setEntryDialog({ bucket: b, mode: 'withdraw' })}
          />
        ))}
      </div>

      <BucketFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        bucket={editingBucket}
        nextSort={nextSort}
        onSubmit={handleSubmit}
      />

      <BucketEntryDialog
        open={entryDialog != null}
        onOpenChange={(open) => {
          if (!open) setEntryDialog(null)
        }}
        bucket={entryDialog?.bucket ?? null}
        mode={entryDialog?.mode ?? 'deposit'}
        onSubmit={async (amount, note) => {
          if (!entryDialog) return
          await addEntry(entryDialog.bucket.id, amount, note)
        }}
      />
    </div>
  )
}
