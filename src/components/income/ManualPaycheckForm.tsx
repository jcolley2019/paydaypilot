import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function todayISO(): string {
  const d = new Date()
  const month = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

interface ManualPaycheckFormProps {
  onAdd: (payDate: string, amount: number) => Promise<void>
}

export function ManualPaycheckForm({ onAdd }: ManualPaycheckFormProps) {
  const [payDate, setPayDate] = useState(todayISO())
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onAdd(payDate, Number(amount) || 0)
      setAmount('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="manual-pay-date" className="text-xs">
          Pay date
        </Label>
        <Input
          id="manual-pay-date"
          type="date"
          value={payDate}
          onChange={(e) => setPayDate(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="manual-pay-amount" className="text-xs">
          Amount
        </Label>
        <Input
          id="manual-pay-amount"
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <Button type="submit" variant="secondary" disabled={saving}>
        {saving ? 'Adding…' : 'Add paycheck'}
      </Button>
    </form>
  )
}
