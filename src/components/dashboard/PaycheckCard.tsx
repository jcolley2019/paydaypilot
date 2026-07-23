import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatAmount } from '@/lib/billLabels'
import { paycheckLoad } from '@/lib/assignment'
import { parseISODate } from '@/lib/localDate'
import { BillInstanceRow } from '@/components/dashboard/BillInstanceRow'
import type { BillInstanceWithBill, PaycheckWithSource } from '@/hooks/usePaydayEngine'

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
  onMarkPaid: (instanceId: string) => void
  onMarkUnpaid: (instanceId: string) => void
  onReassign: (instanceId: string, paycheckId: string) => void
}

export function PaycheckCard({
  paycheck,
  instances,
  otherPaychecks,
  onMarkPaid,
  onMarkUnpaid,
  onReassign,
}: PaycheckCardProps) {
  const load = paycheckLoad(paycheck, instances)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{formatPayDate(paycheck.pay_date)}</CardTitle>
            <CardDescription>{paycheck.sourceName}</CardDescription>
          </div>
          <span className="font-medium">{formatAmount(paycheck.expected_amount, 'fixed')}</span>
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

        <Separator className="my-2" />

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Bills total: {formatAmount(load.billTotal, 'fixed')}
          </span>
          <div className="flex items-center gap-2">
            <span className={load.oversubscribed ? 'font-medium text-destructive' : 'font-medium'}>
              Remaining: {formatAmount(load.remaining, 'fixed')}
            </span>
            {load.oversubscribed && <Badge variant="destructive">Oversubscribed</Badge>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
