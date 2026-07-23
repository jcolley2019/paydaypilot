import { useState } from 'react'
import { Pencil, Trash2, ChevronDown, ChevronUp, Plus, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { formatAmount } from '@/lib/billLabels'
import { BUCKET_KIND_LABELS } from '@/lib/bucketLabels'
import { BUCKET_ICON_MAP } from '@/lib/bucketIcons'
import { bucketProgressPercent, evaluateTargetPace } from '@/lib/bucketMath'
import { parseISODate } from '@/lib/localDate'
import type { Bucket, BucketEntry, BucketIconName } from '@/types/buckets'

interface BucketCardProps {
  bucket: Bucket
  entries: BucketEntry[]
  paychecksUntilTarget: number
  onEdit: (bucket: Bucket) => void
  onDelete: (id: string) => void
  onDeposit: (bucket: Bucket) => void
  onWithdraw: (bucket: Bucket) => void
}

function formatDateLabel(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function BucketCard({
  bucket,
  entries,
  paychecksUntilTarget,
  onEdit,
  onDelete,
  onDeposit,
  onWithdraw,
}: BucketCardProps) {
  const [historyOpen, setHistoryOpen] = useState(false)

  const Icon = BUCKET_ICON_MAP[bucket.icon as BucketIconName] ?? BUCKET_ICON_MAP.PiggyBank
  const percent = bucketProgressPercent(bucket.current_balance, bucket.target_amount)
  const hasPace = bucket.target_amount != null && bucket.target_date
  const pace = hasPace
    ? evaluateTargetPace(bucket.current_balance, bucket.target_amount!, bucket.per_paycheck, paychecksUntilTarget)
    : null
  const recentEntries = entries.filter((e) => e.bucket_id === bucket.id).slice(0, 10)

  return (
    <Card className={cn(!bucket.active && 'opacity-60')}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${bucket.color}26`, color: bucket.color }}
            >
              <Icon className="size-4.5" />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{bucket.name}</span>
                <Badge variant={bucket.kind === 'emergency' ? 'default' : 'secondary'}>
                  {BUCKET_KIND_LABELS[bucket.kind]}
                </Badge>
                {!bucket.active && <Badge variant="outline">Paused</Badge>}
              </div>
              <span className="text-sm text-muted-foreground">
                {formatAmount(bucket.current_balance, 'fixed')}
                {bucket.target_amount != null && ` of ${formatAmount(bucket.target_amount, 'fixed')}`}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${bucket.name}`}
              onClick={() => onEdit(bucket)}
            >
              <Pencil className="size-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${bucket.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{bucket.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This can't be undone. The bucket and its contribution history will be
                    permanently removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => onDelete(bucket.id)}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {percent != null && (
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${percent}%`, backgroundColor: bucket.color }}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{formatAmount(bucket.per_paycheck, 'fixed')} / paycheck</span>
          {bucket.target_amount != null && bucket.target_date && (
            <span className={pace?.status === 'behind' ? 'font-medium text-destructive' : ''}>
              {formatAmount(bucket.target_amount, 'fixed')} by {formatDateLabel(bucket.target_date)} —{' '}
              {pace?.status === 'funded' ? 'funded' : pace?.status === 'on_track' ? 'on track' : 'behind'}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onDeposit(bucket)}>
            <Plus className="size-3.5" />
            Add money
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onWithdraw(bucket)}
            disabled={bucket.current_balance <= 0}
          >
            <Minus className="size-3.5" />
            Withdraw
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            {historyOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            History
          </Button>
        </div>

        {historyOpen && (
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            {recentEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entries yet.</p>
            ) : (
              recentEntries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {formatDateLabel(entry.entry_date)}
                    {entry.note && ` · ${entry.note}`}
                  </span>
                  <span className={cn('shrink-0', entry.amount < 0 && 'text-destructive')}>
                    {entry.amount < 0 ? '-' : '+'}
                    {formatAmount(Math.abs(entry.amount), 'fixed')}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
