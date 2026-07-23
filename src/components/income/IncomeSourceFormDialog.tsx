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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SCHEDULE_LABELS } from '@/lib/scheduleLabels'
import type { IncomeSource, IncomeSourceInsert, Schedule } from '@/types/payday'
import { SCHEDULES } from '@/types/payday'

interface FormState {
  name: string
  netAmount: string
  schedule: Schedule
  anchorDate: string
  semimonthlyFirst: string
  semimonthlySecond: string
  monthlyDay: string
  active: boolean
}

function todayISO(): string {
  const d = new Date()
  const month = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function emptyForm(): FormState {
  return {
    name: '',
    netAmount: '',
    schedule: 'biweekly',
    anchorDate: todayISO(),
    semimonthlyFirst: '1',
    semimonthlySecond: '15',
    monthlyDay: '1',
    active: true,
  }
}

function formFromSource(source: IncomeSource): FormState {
  const base = emptyForm()
  base.name = source.name
  base.netAmount = String(source.net_amount)
  base.schedule = source.schedule
  base.active = source.active
  if (source.anchor_date) base.anchorDate = source.anchor_date
  if (source.semimonthly_days && source.semimonthly_days.length === 2) {
    base.semimonthlyFirst = String(source.semimonthly_days[0])
    base.semimonthlySecond = String(source.semimonthly_days[1])
  }
  if (source.monthly_day != null) base.monthlyDay = String(source.monthly_day)
  return base
}

function buildIncomeSource(form: FormState): IncomeSourceInsert {
  return {
    name: form.name.trim(),
    net_amount: Number(form.netAmount) || 0,
    schedule: form.schedule,
    anchor_date: form.schedule === 'weekly' || form.schedule === 'biweekly' ? form.anchorDate : null,
    semimonthly_days:
      form.schedule === 'semimonthly'
        ? [Number(form.semimonthlyFirst) || 1, Number(form.semimonthlySecond) || 15]
        : null,
    monthly_day: form.schedule === 'monthly' ? Number(form.monthlyDay) || 1 : null,
    active: form.active,
  }
}

interface IncomeSourceFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  source?: IncomeSource | null
  onSubmit: (values: IncomeSourceInsert) => Promise<void>
}

export function IncomeSourceFormDialog({
  open,
  onOpenChange,
  source,
  onSubmit,
}: IncomeSourceFormDialogProps) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(source ? formFromSource(source) : emptyForm())
    }
  }, [open, source])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSubmit(buildIncomeSource(form))
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
            <DialogTitle>{source ? 'Edit income' : 'Add income'}</DialogTitle>
            <DialogDescription>
              {source ? 'Update this income source.' : 'Add a paycheck source to build your payday plan.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="income-name">Name</Label>
            <Input
              id="income-name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Main job"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="income-amount">Net amount per paycheck</Label>
            <Input
              id="income-amount"
              type="number"
              step="0.01"
              min="0"
              value={form.netAmount}
              onChange={(e) => update('netAmount', e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-input p-3">
            <Label>Schedule</Label>
            <Select value={form.schedule} onValueChange={(v) => update('schedule', v as Schedule)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHEDULES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SCHEDULE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(form.schedule === 'weekly' || form.schedule === 'biweekly') && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="income-anchor">Your most recent payday</Label>
                <Input
                  id="income-anchor"
                  type="date"
                  value={form.anchorDate}
                  onChange={(e) => update('anchorDate', e.target.value)}
                  required
                />
              </div>
            )}

            {form.schedule === 'semimonthly' && (
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="income-semi-first">First day</Label>
                    <Input
                      id="income-semi-first"
                      type="number"
                      min="1"
                      max="31"
                      value={form.semimonthlyFirst}
                      onChange={(e) => update('semimonthlyFirst', e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="income-semi-second">Second day</Label>
                    <Input
                      id="income-semi-second"
                      type="number"
                      min="1"
                      max="31"
                      value={form.semimonthlySecond}
                      onChange={(e) => update('semimonthlySecond', e.target.value)}
                      required
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">31 = last day of the month</p>
              </div>
            )}

            {form.schedule === 'monthly' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="income-monthly-day">Day of month</Label>
                <Input
                  id="income-monthly-day"
                  type="number"
                  min="1"
                  max="31"
                  value={form.monthlyDay}
                  onChange={(e) => update('monthlyDay', e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">31 = last day of the month</p>
              </div>
            )}

            {form.schedule === 'irregular' && (
              <p className="text-sm text-muted-foreground">
                You'll add paychecks manually as they arrive.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : source ? 'Save changes' : 'Add income'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
