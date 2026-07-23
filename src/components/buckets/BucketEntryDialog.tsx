import { useEffect, useState, type FormEvent } from 'react'
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
import { formatAmount } from '@/lib/billLabels'
import type { Bucket } from '@/types/buckets'

interface BucketEntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bucket: Bucket | null
  mode: 'deposit' | 'withdraw'
  onSubmit: (signedAmount: number, note?: string) => Promise<void>
}

export function BucketEntryDialog({
  open,
  onOpenChange,
  bucket,
  mode,
  onSubmit,
}: BucketEntryDialogProps) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setAmount('')
      setNote('')
    }
  }, [open])

  const parsed = Number(amount) || 0
  const currentBalance = bucket?.current_balance ?? 0
  const exceedsBalance = mode === 'withdraw' && parsed > currentBalance

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!bucket || parsed <= 0 || exceedsBalance) return
    setSaving(true)
    try {
      await onSubmit(mode === 'withdraw' ? -parsed : parsed, note.trim() || undefined)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {mode === 'deposit' ? 'Add money' : 'Withdraw'}
              {bucket ? ` — ${bucket.name}` : ''}
            </DialogTitle>
            <DialogDescription>
              Current balance: {formatAmount(currentBalance, 'fixed')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entry-amount">Amount</Label>
            <Input
              id="entry-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              aria-invalid={exceedsBalance}
            />
            {exceedsBalance && (
              <p className="text-sm text-destructive">
                Can't withdraw more than the current balance.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entry-note">Note (optional)</Label>
            <Input id="entry-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || parsed <= 0 || exceedsBalance}>
              {saving ? 'Saving…' : mode === 'deposit' ? 'Add money' : 'Withdraw'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
