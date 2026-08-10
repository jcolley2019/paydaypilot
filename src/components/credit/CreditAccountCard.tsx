import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { formatAmount } from '@/lib/billLabels'
import {
  payoffMonths,
  minimumPaymentSchedule,
  whatIfPayment,
  utilizationTargets,
  interestPrincipalSplit,
} from '@/lib/credit'
import type { Bill } from '@/types/bills'

interface CreditAccountCardProps {
  bill: Bill
  onEdit: (bill: Bill) => void
}

function monthsLabel(months: number): string {
  if (months === 0) return 'paid off'
  if (months === 1) return '1 month'
  if (months < 12) return `${months} months`
  const years = Math.floor(months / 12)
  const rem = months % 12
  const yearsLabel = `${years} ${years === 1 ? 'year' : 'years'}`
  return rem === 0 ? yearsLabel : `${yearsLabel}, ${rem} mo`
}

export function CreditAccountCard({ bill, onEdit }: CreditAccountCardProps) {
  const balance = bill.debt_balance
  const apr = bill.debt_apr
  const minPayment = bill.debt_min_payment
  const minPercent = bill.min_payment_percent
  const minFloor = bill.min_payment_floor
  const [whatIfInput, setWhatIfInput] = useState('')

  const hasMathInputs = balance != null && apr != null && minPayment != null && balance > 0
  const hasDecliningMinimum =
    bill.account_type === 'card' && minPercent != null && minFloor != null

  const utilization =
    bill.account_type === 'card' && balance != null && bill.credit_limit != null
      ? utilizationTargets(balance, bill.credit_limit)
      : null

  const payoff = hasMathInputs
    ? hasDecliningMinimum
      ? minimumPaymentSchedule(balance, apr, minPercent!, minFloor!)
      : payoffMonths(balance, apr, minPayment)
    : null
  const split = hasMathInputs ? interestPrincipalSplit(balance, apr, minPayment) : null

  const minimumDescriptor = hasDecliningMinimum
    ? `declining minimums (${minPercent}% of balance or ${formatAmount(minFloor!, 'fixed')}, whichever is greater)`
    : `the ${formatAmount(minPayment ?? 0, 'fixed')} minimum`

  const whatIfValue = Number(whatIfInput)
  const whatIf =
    hasMathInputs && whatIfInput.trim() !== '' && whatIfValue > 0
      ? whatIfPayment(balance, apr, minPayment, whatIfValue - minPayment)
      : null

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{bill.name}</span>
              {bill.account_type && (
                <Badge variant="secondary">{bill.account_type === 'card' ? 'Card' : 'Loan'}</Badge>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {balance != null ? formatAmount(balance, 'fixed') : '—'} balance
              {apr != null && ` · ${apr}% APR`}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${bill.name}`}
            onClick={() => onEdit(bill)}
          >
            <Pencil className="size-4" />
          </Button>
        </div>

        {!hasMathInputs && (
          <p className="text-sm text-muted-foreground">
            Add balance, APR, and minimum payment to see payoff math for this account.
          </p>
        )}

        {utilization && (
          <div className="flex flex-col gap-1.5">
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, utilization.currentPercent)}%` }}
              />
              <div className="absolute inset-y-0 w-px bg-foreground/30" style={{ left: '10%' }} />
              <div className="absolute inset-y-0 w-px bg-foreground/30" style={{ left: '30%' }} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{utilization.currentPercent.toFixed(1)}% utilized</span>
              <span>
                {utilization.dollarsTo30 > 0
                  ? `${formatAmount(utilization.dollarsTo30, 'fixed')} to 30%`
                  : utilization.dollarsTo10 > 0
                    ? `${formatAmount(utilization.dollarsTo10, 'fixed')} to 10%`
                    : 'under 10%'}
              </span>
            </div>
          </div>
        )}

        {payoff && (
          <div className="text-sm">
            {payoff.kind === 'never_pays_off' ? (
              <p className="font-medium text-destructive">
                At {minimumDescriptor}, this never pays off — the payment doesn't cover the
                interest.
              </p>
            ) : payoff.kind === 'exceeds_horizon' ? (
              <p className="font-medium text-amber-500">
                At {minimumDescriptor}, this takes 100+ years to pay off — barely above the
                interest.
              </p>
            ) : (
              <p>
                Paying {minimumDescriptor}:{' '}
                <span className="font-medium">{monthsLabel(payoff.months!)}</span> to pay off,{' '}
                <span className="font-medium">{formatAmount(payoff.totalInterest!, 'fixed')}</span>{' '}
                total interest.
              </p>
            )}
          </div>
        )}

        {split && (
          <p className="text-xs text-muted-foreground">
            This month at the {hasDecliningMinimum ? 'fixed ' : ''}minimum:{' '}
            {formatAmount(split.interest, 'fixed')} interest, {formatAmount(split.principal, 'fixed')}{' '}
            principal.
          </p>
        )}

        {hasMathInputs && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-input p-3">
            <Label htmlFor={`what-if-${bill.id}`} className="font-normal">
              What if I paid this much instead?
            </Label>
            {hasDecliningMinimum && (
              <p className="text-xs text-muted-foreground">
                Compares against a fixed {formatAmount(minPayment!, 'fixed')}/mo — not the
                declining schedule above.
              </p>
            )}
            <Input
              id={`what-if-${bill.id}`}
              type="number"
              step="0.01"
              min="0"
              placeholder={String(minPayment)}
              value={whatIfInput}
              onChange={(e) => setWhatIfInput(e.target.value)}
            />
            {whatIf && (
              <p className={cn('text-sm', whatIf.newNeverPaysOff && 'text-destructive')}>
                {whatIf.newNeverPaysOff
                  ? "That still doesn't cover the interest — it still never pays off."
                  : whatIf.baseNeverPaysOff
                    ? 'That pays it off — the minimum alone never would.'
                    : (whatIf.monthsSaved ?? 0) === 0
                      ? `Same payoff time, ${formatAmount(Math.abs(whatIf.interestSaved ?? 0), 'fixed')} ${
                          (whatIf.interestSaved ?? 0) < 0 ? 'more' : 'less'
                        } interest.`
                      : (whatIf.monthsSaved ?? 0) < 0
                        ? `That's below the minimum pace: ${monthsLabel(
                            Math.abs(whatIf.monthsSaved ?? 0),
                          )} longer, ${formatAmount(Math.abs(whatIf.interestSaved ?? 0), 'fixed')} more interest.`
                        : `${monthsLabel(whatIf.monthsSaved ?? 0)} sooner, ${formatAmount(
                            whatIf.interestSaved ?? 0,
                            'fixed',
                          )} less interest.`}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
