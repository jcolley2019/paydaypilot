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
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Bill, BillCategory, BillInsert, CspBucket, DueRule } from '@/types/bills'
import { BILL_CATEGORIES, CSP_BUCKETS } from '@/types/bills'
import { CATEGORY_LABELS, CSP_BUCKET_LABELS } from '@/lib/billLabels'

type RuleType = DueRule['type']

interface FormState {
  name: string
  category: BillCategory
  amount: string
  amountType: 'fixed' | 'estimate'
  ruleType: RuleType
  monthlyDay: string
  intervalWeeks: string
  intervalAnchor: string
  oneOffDate: string
  autopay: boolean
  paymentMethod: string
  cspBucket: CspBucket
  notes: string
  isDebt: boolean
  debtBalance: string
  debtApr: string
  debtMinPayment: string
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
    category: 'other',
    amount: '',
    amountType: 'fixed',
    ruleType: 'monthly_day',
    monthlyDay: '1',
    intervalWeeks: '2',
    intervalAnchor: todayISO(),
    oneOffDate: todayISO(),
    autopay: false,
    paymentMethod: '',
    cspBucket: 'fixed',
    notes: '',
    isDebt: false,
    debtBalance: '',
    debtApr: '',
    debtMinPayment: '',
    active: true,
  }
}

function formFromBill(bill: Bill): FormState {
  const base = emptyForm()
  base.name = bill.name
  base.category = bill.category
  base.amount = String(bill.amount)
  base.amountType = bill.amount_type
  base.autopay = bill.autopay
  base.paymentMethod = bill.payment_method ?? ''
  base.cspBucket = bill.csp_bucket
  base.notes = bill.notes ?? ''
  base.isDebt = bill.is_debt
  base.debtBalance = bill.debt_balance != null ? String(bill.debt_balance) : ''
  base.debtApr = bill.debt_apr != null ? String(bill.debt_apr) : ''
  base.debtMinPayment = bill.debt_min_payment != null ? String(bill.debt_min_payment) : ''
  base.active = bill.active

  base.ruleType = bill.due_rule.type
  if (bill.due_rule.type === 'monthly_day') base.monthlyDay = String(bill.due_rule.day)
  if (bill.due_rule.type === 'interval_weeks') {
    base.intervalWeeks = String(bill.due_rule.weeks)
    base.intervalAnchor = bill.due_rule.anchor
  }
  if (bill.due_rule.type === 'one_off') base.oneOffDate = bill.due_rule.date

  return base
}

function buildDueRule(form: FormState): DueRule {
  switch (form.ruleType) {
    case 'monthly_day':
      return { type: 'monthly_day', day: Number(form.monthlyDay) || 1 }
    case 'last_day':
      return { type: 'last_day' }
    case 'interval_weeks':
      return {
        type: 'interval_weeks',
        weeks: Number(form.intervalWeeks) || 1,
        anchor: form.intervalAnchor,
      }
    case 'one_off':
      return { type: 'one_off', date: form.oneOffDate }
  }
}

interface BillFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bill?: Bill | null
  onSubmit: (values: BillInsert) => Promise<void>
}

export function BillFormDialog({ open, onOpenChange, bill, onSubmit }: BillFormDialogProps) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(bill ? formFromBill(bill) : emptyForm())
    }
  }, [open, bill])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSubmit({
        name: form.name.trim(),
        category: form.category,
        amount: Number(form.amount) || 0,
        amount_type: form.amountType,
        due_rule: buildDueRule(form),
        autopay: form.autopay,
        payment_method: form.paymentMethod.trim() || null,
        is_debt: form.isDebt,
        debt_balance: form.isDebt && form.debtBalance ? Number(form.debtBalance) : null,
        debt_apr: form.isDebt && form.debtApr ? Number(form.debtApr) : null,
        debt_min_payment: form.isDebt && form.debtMinPayment ? Number(form.debtMinPayment) : null,
        csp_bucket: form.cspBucket,
        active: form.active,
        notes: form.notes.trim() || null,
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
            <DialogTitle>{bill ? 'Edit bill' : 'Add bill'}</DialogTitle>
            <DialogDescription>
              {bill ? 'Update the details for this bill.' : 'Add a new bill to your vault.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bill-name">Name</Label>
            <Input
              id="bill-name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => update('category', v as BillCategory)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILL_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bill-amount">Amount</Label>
              <Input
                id="bill-amount"
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => update('amount', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-input px-3 py-2">
            <Label htmlFor="bill-estimate" className="font-normal">
              Amount is an estimate
            </Label>
            <Switch
              id="bill-estimate"
              checked={form.amountType === 'estimate'}
              onCheckedChange={(checked) => update('amountType', checked ? 'estimate' : 'fixed')}
            />
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-input p-3">
            <Label>Due rule</Label>
            <Select value={form.ruleType} onValueChange={(v) => update('ruleType', v as RuleType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly_day">Monthly on a day</SelectItem>
                <SelectItem value="last_day">Last day of month</SelectItem>
                <SelectItem value="interval_weeks">Every N weeks</SelectItem>
                <SelectItem value="one_off">One-time</SelectItem>
              </SelectContent>
            </Select>

            {form.ruleType === 'monthly_day' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rule-day">Day of month</Label>
                <Input
                  id="rule-day"
                  type="number"
                  min="1"
                  max="31"
                  value={form.monthlyDay}
                  onChange={(e) => update('monthlyDay', e.target.value)}
                  required
                />
              </div>
            )}

            {form.ruleType === 'interval_weeks' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rule-weeks">Every (weeks)</Label>
                  <Input
                    id="rule-weeks"
                    type="number"
                    min="1"
                    value={form.intervalWeeks}
                    onChange={(e) => update('intervalWeeks', e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rule-anchor">Anchor date</Label>
                  <Input
                    id="rule-anchor"
                    type="date"
                    value={form.intervalAnchor}
                    onChange={(e) => update('intervalAnchor', e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            {form.ruleType === 'one_off' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rule-date">Date</Label>
                <Input
                  id="rule-date"
                  type="date"
                  value={form.oneOffDate}
                  onChange={(e) => update('oneOffDate', e.target.value)}
                  required
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-input px-3 py-2">
            <Label htmlFor="bill-autopay" className="font-normal">
              Autopay
            </Label>
            <Switch
              id="bill-autopay"
              checked={form.autopay}
              onCheckedChange={(checked) => update('autopay', checked)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bill-payment-method">Payment method</Label>
            <Input
              id="bill-payment-method"
              value={form.paymentMethod}
              onChange={(e) => update('paymentMethod', e.target.value)}
              placeholder="e.g. Chase checking"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>CSP bucket</Label>
            <Select
              value={form.cspBucket}
              onValueChange={(v) => update('cspBucket', v as CspBucket)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CSP_BUCKETS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {CSP_BUCKET_LABELS[b]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-input px-3 py-2">
            <Label htmlFor="bill-is-debt" className="font-normal">
              This is a debt payment
            </Label>
            <Switch
              id="bill-is-debt"
              checked={form.isDebt}
              onCheckedChange={(checked) => update('isDebt', checked)}
            />
          </div>

          {form.isDebt && (
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="debt-balance">Balance</Label>
                <Input
                  id="debt-balance"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.debtBalance}
                  onChange={(e) => update('debtBalance', e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="debt-apr">APR %</Label>
                <Input
                  id="debt-apr"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.debtApr}
                  onChange={(e) => update('debtApr', e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="debt-min">Min payment</Label>
                <Input
                  id="debt-min"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.debtMinPayment}
                  onChange={(e) => update('debtMinPayment', e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bill-notes">Notes</Label>
            <Textarea
              id="bill-notes"
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
            />
          </div>

          {bill && (
            <div className="flex items-center justify-between rounded-lg border border-input px-3 py-2">
              <Label htmlFor="bill-active" className="font-normal">
                Active
              </Label>
              <Switch
                id="bill-active"
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
              {saving ? 'Saving…' : bill ? 'Save changes' : 'Add bill'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
