import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ChevronDown } from 'lucide-react'
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
import type { AccountType, Bill, BillCategory, BillInsert, CspBucket, DueRule } from '@/types/bills'
import { ACCOUNT_TYPES, BILL_CATEGORIES, CSP_BUCKETS } from '@/types/bills'
import { CATEGORY_LABELS, CSP_BUCKET_LABELS } from '@/lib/billLabels'
import { DayOfMonthPicker, type DayOfMonthValue } from '@/components/bills/DayOfMonthPicker'
import { IntervalMonthsFields } from '@/components/bills/IntervalMonthsFields'
import { MAX_INTERVAL_MONTHS, MIN_INTERVAL_MONTHS } from '@/lib/dueRules'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  ALL_TOUCHED,
  UNTOUCHED,
  applyNameGuess,
  guessHint,
  hasMoreOptionsValues,
  type GuessTouched,
} from '@/components/bills/billFormGuess'

/** How long typing pauses before the name is re-guessed, so "Car" doesn't flash Debt on the way to "Car insurance". */
const GUESS_DEBOUNCE_MS = 400

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
  intervalMonths: string
  monthsAnchor: string
  oneOffDate: string
  autopay: boolean
  paymentMethod: string
  cspBucket: CspBucket
  notes: string
  isDebt: boolean
  debtBalance: string
  debtApr: string
  debtMinPayment: string
  accountType: AccountType | ''
  creditLimit: string
  minPaymentPercent: string
  minPaymentFloor: string
  active: boolean
}

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  card: 'Credit card',
  loan: 'Loan',
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
    intervalMonths: '3',
    monthsAnchor: todayISO(),
    oneOffDate: todayISO(),
    autopay: false,
    paymentMethod: '',
    cspBucket: 'fixed',
    notes: '',
    isDebt: false,
    debtBalance: '',
    debtApr: '',
    debtMinPayment: '',
    accountType: '',
    creditLimit: '',
    minPaymentPercent: '',
    minPaymentFloor: '',
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
  base.accountType = bill.account_type ?? ''
  base.creditLimit = bill.credit_limit != null ? String(bill.credit_limit) : ''
  base.minPaymentPercent = bill.min_payment_percent != null ? String(bill.min_payment_percent) : ''
  base.minPaymentFloor = bill.min_payment_floor != null ? String(bill.min_payment_floor) : ''
  base.active = bill.active

  base.ruleType = bill.due_rule.type
  if (bill.due_rule.type === 'monthly_day') base.monthlyDay = String(bill.due_rule.day)
  if (bill.due_rule.type === 'interval_weeks') {
    base.intervalWeeks = String(bill.due_rule.weeks)
    base.intervalAnchor = bill.due_rule.anchor
  }
  if (bill.due_rule.type === 'interval_months') {
    base.intervalMonths = String(bill.due_rule.months)
    base.monthsAnchor = bill.due_rule.anchor
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
    case 'interval_months': {
      // The inputs enforce 2–24 on submit; clamp anyway so a stray value can't reach the db.
      const months = Math.round(Number(form.intervalMonths)) || 3
      return {
        type: 'interval_months',
        months: Math.min(MAX_INTERVAL_MONTHS, Math.max(MIN_INTERVAL_MONTHS, months)),
        anchor: form.monthsAnchor,
      }
    }
    case 'one_off':
      return { type: 'one_off', date: form.oneOffDate }
  }
}

/** The form with the name's guess applied to any category/bucket the user hasn't picked. */
function withGuess(form: FormState, touched: GuessTouched): FormState {
  const next = applyNameGuess(form.name, { category: form.category, cspBucket: form.cspBucket }, touched)
  if (next.category === form.category && next.cspBucket === form.cspBucket) return form
  return { ...form, category: next.category, cspBucket: next.cspBucket }
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
  const [touched, setTouched] = useState<GuessTouched>(UNTOUCHED)
  const [moreOpen, setMoreOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setForm(bill ? formFromBill(bill) : emptyForm())
      setTouched(bill ? ALL_TOUCHED : UNTOUCHED)
      setMoreOpen(bill ? hasMoreOptionsValues(bill) : false)
    }
  }, [open, bill])

  // Re-guess once typing pauses; blur and save apply it immediately.
  useEffect(() => {
    if (!open || (touched.category && touched.cspBucket)) return
    const timer = setTimeout(() => setForm((f) => withGuess(f, touched)), GUESS_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [open, form.name, touched])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const hint = guessHint({ category: form.category, cspBucket: form.cspBucket }, touched)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    void save(false)
  }

  function handleSaveAndAddAnother() {
    if (!formRef.current?.reportValidity()) return
    void save(true)
  }

  async function save(addAnother: boolean) {
    const values = withGuess(form, touched)
    setSaving(true)
    try {
      await onSubmit({
        name: values.name.trim(),
        category: values.category,
        amount: Number(form.amount) || 0,
        amount_type: form.amountType,
        due_rule: buildDueRule(form),
        autopay: form.autopay,
        payment_method: form.paymentMethod.trim() || null,
        is_debt: form.isDebt,
        debt_balance: form.isDebt && form.debtBalance ? Number(form.debtBalance) : null,
        debt_apr: form.isDebt && form.debtApr ? Number(form.debtApr) : null,
        debt_min_payment: form.isDebt && form.debtMinPayment ? Number(form.debtMinPayment) : null,
        account_type: form.isDebt && form.accountType ? form.accountType : null,
        credit_limit:
          form.isDebt && form.accountType === 'card' && form.creditLimit
            ? Number(form.creditLimit)
            : null,
        min_payment_percent:
          form.isDebt && form.accountType === 'card' && form.minPaymentPercent
            ? Number(form.minPaymentPercent)
            : null,
        min_payment_floor:
          form.isDebt && form.accountType === 'card' && form.minPaymentFloor
            ? Number(form.minPaymentFloor)
            : null,
        csp_bucket: values.cspBucket,
        active: form.active,
        notes: form.notes.trim() || null,
      })
      if (addAnother) {
        setForm(emptyForm())
        setTouched(UNTOUCHED)
        setMoreOpen(false)
        nameRef.current?.focus()
      } else {
        onOpenChange(false)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{bill ? 'Edit bill' : 'Add bill'}</DialogTitle>
            <DialogDescription>
              {bill ? 'Update the details for this bill.' : 'Add a new bill to your vault.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bill-name">Name</Label>
            <Input
              ref={nameRef}
              id="bill-name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              onBlur={() => setForm((f) => withGuess(f, touched))}
              aria-describedby={hint ? 'bill-name-hint' : undefined}
              required
            />
            {hint && (
              <p id="bill-name-hint" className="text-xs text-muted-foreground" aria-live="polite">
                {hint}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bill-amount">Amount</Label>
            <Input
              id="bill-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => update('amount', e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-input p-3">
            <Label>Due rule</Label>
            <Select
              value={form.ruleType}
              onValueChange={(v) => {
                const nextType = v as RuleType
                setForm((f) => ({
                  ...f,
                  ruleType: nextType,
                  monthlyDay: nextType === 'monthly_day' && f.ruleType === 'last_day' ? '' : f.monthlyDay,
                }))
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly_day">Monthly on a day</SelectItem>
                <SelectItem value="last_day">Last day of month</SelectItem>
                <SelectItem value="interval_weeks">Every N weeks</SelectItem>
                <SelectItem value="interval_months">Every few months / Yearly</SelectItem>
                <SelectItem value="one_off">One-time</SelectItem>
              </SelectContent>
            </Select>

            {form.ruleType === 'monthly_day' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rule-day">Day of month</Label>
                <DayOfMonthPicker
                  id="rule-day"
                  value={form.monthlyDay === '' ? null : Number(form.monthlyDay)}
                  onChange={(v: DayOfMonthValue) => {
                    if (v === 'last') {
                      setForm((f) => ({ ...f, ruleType: 'last_day' }))
                    } else {
                      update('monthlyDay', String(v))
                    }
                  }}
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

            {form.ruleType === 'interval_months' && (
              <IntervalMonthsFields
                months={form.intervalMonths}
                anchor={form.monthsAnchor}
                onChange={({ months, anchor }) =>
                  setForm((f) => ({ ...f, intervalMonths: months, monthsAnchor: anchor }))
                }
              />
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

          <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="flex flex-col gap-4">
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="shrink-0">More options</span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  Category, autopay, debt, notes
                </span>
              </span>
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-[var(--pp-ease)] group-data-[state=open]:rotate-180"
                aria-hidden="true"
              />
            </CollapsibleTrigger>

            <CollapsibleContent className="-m-1 flex flex-col gap-4 overflow-hidden p-1 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => {
                      update('category', v as BillCategory)
                      setTouched((t) => ({ ...t, category: true }))
                    }}
                  >
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
                  <Label>CSP bucket</Label>
                  <Select
                    value={form.cspBucket}
                    onValueChange={(v) => {
                      update('cspBucket', v as CspBucket)
                      setTouched((t) => ({ ...t, cspBucket: true }))
                    }}
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
                <div className="flex flex-col gap-3">
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

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>Account type</Label>
                      <Select
                        value={form.accountType}
                        onValueChange={(v) => update('accountType', v as AccountType)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {ACCOUNT_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {ACCOUNT_TYPE_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {form.accountType === 'card' && (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="debt-credit-limit">Credit limit</Label>
                        <Input
                          id="debt-credit-limit"
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.creditLimit}
                          onChange={(e) => update('creditLimit', e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  {form.accountType === 'card' && (
                    <div className="flex flex-col gap-2 rounded-lg border border-input p-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="debt-min-percent">Minimum payment %</Label>
                          <Input
                            id="debt-min-percent"
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.minPaymentPercent}
                            onChange={(e) => update('minPaymentPercent', e.target.value)}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="debt-min-floor">Minimum floor $</Label>
                          <Input
                            id="debt-min-floor"
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.minPaymentFloor}
                            onChange={(e) => update('minPaymentFloor', e.target.value)}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        From your statement, e.g. 2% or $25, whichever is greater — leave blank to use
                        the fixed minimum payment above.
                      </p>
                    </div>
                  )}
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
            </CollapsibleContent>
          </Collapsible>

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
            {!bill && (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={handleSaveAndAddAnother}
              >
                Save & add another
              </Button>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : bill ? 'Save changes' : 'Add bill'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
