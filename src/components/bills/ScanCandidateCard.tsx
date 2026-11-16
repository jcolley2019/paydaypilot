import { useId, type ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
import { DayOfMonthPicker } from '@/components/bills/DayOfMonthPicker'
import { draftAction, draftIssues, type CandidateDraft, type DueRuleDraft } from '@/components/bills/scanDraft'
import { CATEGORY_LABELS, CSP_BUCKET_LABELS, formatAmount } from '@/lib/billLabels'
import { sameAmount, type BillMatch, type ImportAction } from '@/lib/importActions'
import { cn } from '@/lib/utils'
import type { AccountType, BillCategory, CspBucket, DueRule } from '@/types/bills'
import { BILL_CATEGORIES, CSP_BUCKETS } from '@/types/bills'

const RULE_LABELS: Record<DueRule['type'], string> = {
  monthly_day: 'Monthly on a day',
  last_day: 'Last day of month',
  interval_weeks: 'Every N weeks',
  one_off: 'One-time',
}

const RULE_TYPES = Object.keys(RULE_LABELS) as DueRule['type'][]

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  card: 'Credit card',
  loan: 'Loan',
}

const LOW_CONFIDENCE = 0.6

function money(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/** What the statement said about a debt, e.g. "Credit card · balance $2,450.12 · 24.99% APR". */
function debtSummary(draft: CandidateDraft): string | null {
  const { base } = draft
  if (!base.is_debt) return null
  const parts = [base.account_type ? ACCOUNT_TYPE_LABELS[base.account_type] : 'Debt']
  if (base.debt_balance !== null) parts.push(`balance ${money(base.debt_balance)}`)
  if (base.debt_apr !== null) parts.push(`${base.debt_apr}% APR`)
  return parts.join(' · ')
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

interface DueRuleFieldsProps {
  id: string
  rule: DueRuleDraft
  issue?: string
  onChange: (rule: DueRuleDraft) => void
}

function DueRuleFields({ id, rule, issue, onChange }: DueRuleFieldsProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-rule`} className="text-xs font-normal text-muted-foreground">
        Due
      </Label>
      <div className="grid grid-cols-2 gap-3">
        <Select
          value={rule.type}
          onValueChange={(value) => {
            const type = value as DueRule['type']
            // Like the bill form: coming back from "last day" asks for a day again.
            onChange({ ...rule, type, day: type === 'monthly_day' && rule.type === 'last_day' ? null : rule.day })
          }}
        >
          <SelectTrigger id={`${id}-rule`} className={cn('w-full min-w-0', rule.type === 'last_day' && 'col-span-2')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RULE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {RULE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {rule.type === 'monthly_day' && (
          <DayOfMonthPicker
            value={rule.day}
            onChange={(value) => onChange(value === 'last' ? { ...rule, type: 'last_day' } : { ...rule, day: value })}
          />
        )}

        {rule.type === 'interval_weeks' && (
          <div className="flex min-w-0 items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              aria-label="Weeks between charges"
              aria-invalid={issue ? true : undefined}
              value={rule.weeks}
              onChange={(e) => onChange({ ...rule, weeks: e.target.value })}
            />
            <span className="text-xs text-muted-foreground">weeks</span>
          </div>
        )}

        {rule.type === 'one_off' && (
          <Input
            type="date"
            aria-label="Due date"
            aria-invalid={issue ? true : undefined}
            value={rule.date}
            onChange={(e) => onChange({ ...rule, date: e.target.value })}
          />
        )}

        {rule.type === 'interval_weeks' && (
          <label className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">Starting</span>
            <Input
              type="date"
              aria-invalid={issue ? true : undefined}
              value={rule.anchor}
              onChange={(e) => onChange({ ...rule, anchor: e.target.value })}
            />
          </label>
        )}
      </div>
      {issue && <p className="text-xs text-destructive">{issue}</p>}
    </div>
  )
}

const MATCH_ACTIONS: { value: ImportAction; label: string }[] = [
  { value: 'update', label: 'Update' },
  { value: 'skip', label: 'Skip' },
  { value: 'add', label: 'Add as new' },
]

/** Compact Update / Skip / Add-as-new picker for a matched card, built on native radios. */
function MatchActionControl({
  name,
  value,
  billName,
  onChange,
}: {
  name: string
  value: ImportAction
  billName: string
  onChange: (action: ImportAction) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`What to do with ${billName}`}
      className="grid grid-cols-3 gap-0.5 rounded-lg bg-muted p-0.5 text-xs"
    >
      {MATCH_ACTIONS.map((option) => (
        <label
          key={option.value}
          className="flex h-7 cursor-pointer items-center justify-center rounded-md px-2 font-medium whitespace-nowrap text-muted-foreground transition-colors has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-ring/50"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  )
}

/** "matches T-Mobile · current $94.55 → new $97.20" */
function MatchLine({ match, amount }: { match: BillMatch; amount: string }) {
  const next = Number(amount)
  const valid = amount.trim() !== '' && Number.isFinite(next) && next > 0
  return (
    <p className="min-w-0 text-xs text-muted-foreground">
      matches <span className="font-medium text-foreground">{match.name}</span> · current{' '}
      <span className="pp-money">{money(match.amount)}</span> → new{' '}
      <span className="pp-money font-medium text-foreground">{valid ? money(next) : '—'}</span>
      {valid && sameAmount(next, match.amount) && ' · no change'}
    </p>
  )
}

interface ScanCandidateCardProps {
  draft: CandidateDraft
  onChange: (draft: CandidateDraft) => void
}

export function ScanCandidateCard({ draft, onChange }: ScanCandidateCardProps) {
  const id = useId()
  const issues = draftIssues(draft)
  const debt = debtSummary(draft)
  const lowConfidence = draft.confidence < LOW_CONFIDENCE
  const action = draftAction(draft)
  const { match } = draft
  // Unmatched cards keep the checkbox; their details line up past it.
  const indent = match ? undefined : 'pl-7'

  function update(changes: Partial<CandidateDraft>) {
    onChange({ ...draft, ...changes })
  }

  const summary = (
    <>
      <span className="truncate font-medium">{draft.name}</span>
      <span className="pp-money shrink-0 text-sm">
        {formatAmount(Number(draft.amount) || 0, draft.base.amount_type)}
      </span>
    </>
  )

  return (
    <Card size="sm" className={cn(action === 'skip' && 'bg-transparent')}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {!match && (
            <Checkbox
              id={`${id}-include`}
              checked={action === 'add'}
              onCheckedChange={(checked) => update({ override: checked === true ? 'add' : 'skip' })}
              aria-label={`Add ${draft.name || 'this bill'}`}
            />
          )}
          {action === 'add' ? (
            <Input
              aria-label="Bill name"
              value={draft.name}
              aria-invalid={issues.name ? true : undefined}
              onChange={(e) => update({ name: e.target.value })}
              className="font-medium"
            />
          ) : match ? (
            <div
              className={cn(
                'flex min-w-0 flex-1 items-baseline justify-between gap-3',
                action === 'skip' && 'text-muted-foreground',
              )}
            >
              {summary}
            </div>
          ) : (
            <label
              htmlFor={`${id}-include`}
              className="flex min-w-0 flex-1 items-baseline justify-between gap-3 text-muted-foreground"
            >
              {summary}
            </label>
          )}
        </div>
        {action === 'add' && issues.name && (
          <p className={cn('-mt-1.5 text-xs text-destructive', indent)}>{issues.name}</p>
        )}

        {match && (
          <div className="flex flex-col gap-2">
            <MatchLine match={match} amount={draft.amount} />
            <MatchActionControl
              name={`${id}-action`}
              value={action}
              billName={match.name}
              onChange={(override) => update({ override })}
            />
          </div>
        )}

        {lowConfidence && (
          <div className={cn('flex flex-wrap gap-1.5', indent)}>
            <Badge variant="outline" className="text-muted-foreground">
              Low confidence — double-check
            </Badge>
          </div>
        )}

        {(debt || draft.evidence || draft.sourceFile) && (
          <div className={cn('flex min-w-0 flex-col gap-0.5 text-xs text-muted-foreground', indent)}>
            {debt && <p>{debt}</p>}
            {draft.evidence && <p>{draft.evidence}</p>}
            {draft.sourceFile && <p className="pp-label truncate">{draft.sourceFile}</p>}
          </div>
        )}

        {action === 'update' && (
          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
            <Field
              id={`${id}-amount`}
              label={draft.base.amount_type === 'estimate' ? 'New amount (varies)' : 'New amount'}
              error={issues.amount}
            >
              <Input
                id={`${id}-amount`}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={draft.amount}
                aria-invalid={issues.amount ? true : undefined}
                onChange={(e) => update({ amount: e.target.value })}
              />
            </Field>
          </div>
        )}

        {action === 'add' && (
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            <div className="grid grid-cols-2 gap-3">
              <Field
                id={`${id}-amount`}
                label={draft.base.amount_type === 'estimate' ? 'Amount (varies)' : 'Amount'}
                error={issues.amount}
              >
                <Input
                  id={`${id}-amount`}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={draft.amount}
                  aria-invalid={issues.amount ? true : undefined}
                  onChange={(e) => update({ amount: e.target.value })}
                />
              </Field>
              <Field id={`${id}-category`} label="Category">
                <Select value={draft.category} onValueChange={(value) => update({ category: value as BillCategory })}>
                  <SelectTrigger id={`${id}-category`} className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BILL_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {CATEGORY_LABELS[category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <DueRuleFields id={id} rule={draft.rule} issue={issues.rule} onChange={(rule) => update({ rule })} />

            <div className="grid grid-cols-2 gap-3">
              <Field id={`${id}-csp`} label="CSP bucket">
                <Select value={draft.cspBucket} onValueChange={(value) => update({ cspBucket: value as CspBucket })}>
                  <SelectTrigger id={`${id}-csp`} className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CSP_BUCKETS.map((bucket) => (
                      <SelectItem key={bucket} value={bucket}>
                        {CSP_BUCKET_LABELS[bucket]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id={`${id}-autopay`} label="Autopay">
                <div className="flex h-8 items-center">
                  <Switch
                    id={`${id}-autopay`}
                    checked={draft.autopay}
                    onCheckedChange={(checked) => update({ autopay: checked })}
                  />
                </div>
              </Field>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
