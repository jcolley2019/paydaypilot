import { useState } from 'react'
import { Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { formatAmount } from '@/lib/billLabels'
import { paycheckLoad } from '@/lib/assignment'
import { parseISODate } from '@/lib/localDate'
import { BillInstanceRow } from '@/components/dashboard/BillInstanceRow'
import type { BillInstanceWithBill, PaycheckWithSource } from '@/hooks/usePaydayEngine'
import type { Bucket, BucketEntry } from '@/types/buckets'

function formatPayDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

interface PaycheckCardProps {
  paycheck: PaycheckWithSource
  instances: BillInstanceWithBill[]
  otherPaychecks: PaycheckWithSource[]
  buckets: Bucket[]
  entries: BucketEntry[]
  onMarkPaid: (instanceId: string) => void
  onMarkUnpaid: (instanceId: string) => void
  onReassign: (instanceId: string, paycheckId: string) => void
  onLogContribution: (bucketId: string, paycheckId: string, amount: number) => Promise<void>
}

export function PaycheckCard({
  paycheck,
  instances,
  otherPaychecks,
  buckets,
  entries,
  onMarkPaid,
  onMarkUnpaid,
  onReassign,
  onLogContribution,
}: PaycheckCardProps) {
  const [loggingId, setLoggingId] = useState<string | null>(null)
  const load = paycheckLoad(paycheck, instances)

  const savingsBuckets = buckets.filter((b) => b.active && b.per_paycheck > 0)
  const savingsTotal = savingsBuckets.reduce((sum, b) => sum + b.per_paycheck, 0)
  const remaining = paycheck.expected_amount - load.billTotal - savingsTotal
  const oversubscribed = remaining < 0

  function isLogged(bucketId: string): boolean {
    return entries.some((e) => e.bucket_id === bucketId && e.paycheck_id === paycheck.id)
  }

  async function handleLog(bucket: Bucket) {
    setLoggingId(bucket.id)
    try {
      await onLogContribution(bucket.id, paycheck.id, bucket.per_paycheck)
    } finally {
      setLoggingId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{formatPayDate(paycheck.pay_date)}</CardTitle>
            <CardDescription>{paycheck.sourceName}</CardDescription>
          </div>
          <span className="pp-money text-base font-medium">
            {formatAmount(paycheck.expected_amount, 'fixed')}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-1">
        {instances.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bills assigned to this paycheck.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {instances.map((instance) => (
              <BillInstanceRow
                key={instance.id}
                instance={instance}
                otherPaychecks={otherPaychecks}
                onMarkPaid={onMarkPaid}
                onMarkUnpaid={onMarkUnpaid}
                onReassign={onReassign}
              />
            ))}
          </div>
        )}

        {savingsBuckets.length > 0 && (
          <>
            <Separator className="my-2" />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-muted-foreground">Savings</span>
              {savingsBuckets.map((bucket) => {
                const logged = isLogged(bucket.id)
                return (
                  <div key={bucket.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className={cn(logged && 'text-muted-foreground line-through')}>
                      {bucket.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={cn(logged && 'text-muted-foreground line-through')}>
                        {formatAmount(bucket.per_paycheck, 'fixed')}
                      </span>
                      <Button
                        type="button"
                        variant={logged ? 'ghost' : 'outline'}
                        size="icon-sm"
                        disabled={logged || loggingId === bucket.id}
                        aria-label={logged ? `${bucket.name} logged` : `Log ${bucket.name} contribution`}
                        onClick={() => handleLog(bucket)}
                      >
                        <Check className="size-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <Separator className="my-2" />

        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Bills total: {formatAmount(load.billTotal, 'fixed')}</span>
          </div>
          {savingsBuckets.length > 0 && (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Savings planned: {formatAmount(savingsTotal, 'fixed')}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className={oversubscribed ? 'font-medium text-destructive' : 'font-medium'}>
              Remaining: {formatAmount(remaining, 'fixed')}
            </span>
            {oversubscribed && <Badge variant="destructive">Oversubscribed</Badge>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
