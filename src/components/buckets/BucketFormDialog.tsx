import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatAmount } from '@/lib/billLabels'
import { parseISODate, toISODate } from '@/lib/localDate'
import { generatePayDates } from '@/lib/paydays'
import { suggestPerPaycheck } from '@/lib/bucketMath'
import { useIncomeSources } from '@/hooks/useIncomeSources'
import type { Bucket, BucketInsert, BucketKind } from '@/types/buckets'
import { BUCKET_KINDS, BUCKET_COLORS, BUCKET_ICON_NAMES } from '@/types/buckets'
import { BUCKET_KIND_LABELS } from '@/lib/bucketLabels'
import { BUCKET_ICON_MAP } from '@/lib/bucketIcons'

function formatDateLabel(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface FormState {
  name: string
  kind: BucketKind
  targetAmount: string
  targetDate: string
  perPaycheck: string
  color: string
  icon: string
  sort: number
  active: boolean
}

function emptyForm(nextSort: number): FormState {
  return {
    name: '',
    kind: 'goal',
    targetAmount: '',
    targetDate: '',
    perPaycheck: '',
    color: BUCKET_COLORS[0],
    icon: BUCKET_ICON_NAMES[0],
    sort: nextSort,
    active: true,
  }
}

function formFromBucket(bucket: Bucket): FormState {
  return {
    name: bucket.name,
    kind: bucket.kind,
    targetAmount: bucket.target_amount != null ? String(bucket.target_amount) : '',
    targetDate: bucket.target_date ?? '',
    perPaycheck: String(bucket.per_paycheck),
    color: bucket.color,
    icon: bucket.icon,
    sort: bucket.sort,
    active: bucket.active,
  }
}

interface BucketFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bucket?: Bucket | null
  nextSort: number
  onSubmit: (values: BucketInsert) => Promise<void>
}

export function BucketFormDialog({
  open,
  onOpenChange,
  bucket,
  nextSort,
  onSubmit,
}: BucketFormDialogProps) {
  const [form, setForm] = useState<FormState>(() => emptyForm(nextSort))
  const [saving, setSaving] = useState(false)
  const { incomeSources } = useIncomeSources()

  useEffect(() => {
    if (open) {
      setForm(bucket ? formFromBucket(bucket) : emptyForm(nextSort))
    }
  }, [open, bucket, nextSort])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const activeSources = useMemo(() => incomeSources.filter((s) => s.active), [incomeSources])
  const today = useMemo(() => new Date(), [open])
  const todayISO = useMemo(() => toISODate(today), [today])

  const payDates = useMemo(() => {
    if (!form.targetDate) return []
    const target = parseISODate(form.targetDate)
    const dates = activeSources.flatMap((source) => generatePayDates(source, today, target))
    return Array.from(new Set(dates.map((d) => toISODate(d)))).sort()
  }, [activeSources, form.targetDate, today])

  const paycheckCount = useMemo(
    () => payDates.filter((d) => d > todayISO).length,
    [payDates, todayISO],
  )

  const suggestion = useMemo(() => {
    if (!form.targetAmount || !form.targetDate) return null
    return suggestPerPaycheck({
      targetAmount: Number(form.targetAmount),
      targetDate: form.targetDate,
      currentBalance: bucket?.current_balance ?? 0,
      payDates,
      today,
    })
  }, [form.targetAmount, form.targetDate, payDates, bucket, today])

  useEffect(() => {
    if (suggestion != null) {
      setForm((f) => (f.perPaycheck === '' ? { ...f, perPaycheck: String(suggestion) } : f))
    }
  }, [suggestion])

  const hasTargetInputs = form.targetAmount !== '' && form.targetDate !== ''
  const hasIncome = activeSources.length > 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSubmit({
        name: form.name.trim(),
        kind: form.kind,
        target_amount: form.targetAmount ? Number(form.targetAmount) : null,
        target_date: form.targetDate || null,
        per_paycheck: Number(form.perPaycheck) || 0,
        color: form.color,
        icon: form.icon,
        sort: form.sort,
        active: form.active,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{bucket ? 'Edit bucket' : 'Add bucket'}</DialogTitle>
            <DialogDescription>
              {bucket ? 'Update this savings bucket.' : 'Create a new savings goal.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bucket-name">Name</Label>
            <Input
              id="bucket-name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Kind</Label>
            <Select value={form.kind} onValueChange={(v) => update('kind', v as BucketKind)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUCKET_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {BUCKET_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bucket-target-amount">Target amount</Label>
              <Input
                id="bucket-target-amount"
                type="number"
                step="0.01"
                min="0"
                value={form.targetAmount}
                onChange={(e) => update('targetAmount', e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bucket-target-date">Target date</Label>
              <Input
                id="bucket-target-date"
                type="date"
                value={form.targetDate}
                onChange={(e) => update('targetDate', e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bucket-per-paycheck">Per-paycheck contribution</Label>
            <Input
              id="bucket-per-paycheck"
              type="number"
              step="0.01"
              min="0"
              value={form.perPaycheck}
              onChange={(e) => update('perPaycheck', e.target.value)}
              placeholder="Optional — defaults to $0"
            />
            {hasTargetInputs &&
              (!hasIncome ? (
                <p className="text-sm text-muted-foreground">
                  Add your income in Settings to get a suggested amount.
                </p>
              ) : suggestion == null ? (
                <p className="text-sm text-muted-foreground">
                  Target date is before your next payday.
                </p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>
                    Suggested: {formatAmount(suggestion, 'fixed')} per paycheck to hit{' '}
                    {formatAmount(Number(form.targetAmount), 'fixed')} by{' '}
                    {formatDateLabel(form.targetDate)} ({paycheckCount} paycheck
                    {paycheckCount === 1 ? '' : 's'})
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => update('perPaycheck', String(suggestion))}
                  >
                    Use suggested
                  </Button>
                </div>
              ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {BUCKET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => update('color', c)}
                  className={cn(
                    'size-7 rounded-full ring-2 ring-offset-2 ring-offset-background transition',
                    form.color === c ? 'ring-foreground' : 'ring-transparent',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-2">
              {BUCKET_ICON_NAMES.map((name) => {
                const Icon = BUCKET_ICON_MAP[name]
                return (
                  <button
                    key={name}
                    type="button"
                    aria-label={name}
                    onClick={() => update('icon', name)}
                    className={cn(
                      'flex size-8 items-center justify-center rounded-lg border border-input transition',
                      form.icon === name ? 'border-ring bg-muted' : 'hover:bg-muted',
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                )
              })}
            </div>
          </div>

          {bucket && (
            <div className="flex items-center justify-between rounded-lg border border-input px-3 py-2">
              <Label htmlFor="bucket-active" className="font-normal">
                Active
              </Label>
              <Switch
                id="bucket-active"
                checked={form.active}
                onCheckedChange={(checked) => update('active', checked)}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : bucket ? 'Save changes' : 'Add bucket'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
