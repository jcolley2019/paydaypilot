import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatAmount, CSP_BUCKET_LABELS } from '@/lib/billLabels'
import type { CspBreakdownResult, CspCategory, CspStatus } from '@/lib/plan'
import type { Bill } from '@/types/bills'
import type { Bucket } from '@/types/buckets'

const CATEGORY_ORDER: CspCategory[] = ['fixed', 'investment', 'savings', 'guilt_free']

const STATUS_BAR_COLOR: Record<CspStatus, string> = {
  under: 'bg-sky-500',
  within: 'bg-emerald-500',
  over: 'bg-destructive',
}

const STATUS_LABEL: Record<CspStatus, string> = {
  under: 'Under target',
  within: 'On target',
  over: 'Over target',
}

interface CategoryItem {
  key: string
  label: string
  amount: number
}

function categoryItems(category: CspCategory, bills: Bill[], buckets: Bucket[]): CategoryItem[] {
  if (category === 'guilt_free') return []

  const billItems = bills
    .filter((b) => b.active && b.csp_bucket === category)
    .map((b) => ({ key: `bill-${b.id}`, label: b.name, amount: b.amount }))

  const bucketItems = buckets
    .filter((b) => {
      if (!b.active || b.per_paycheck <= 0) return false
      if (category === 'investment') return b.kind === 'invest'
      if (category === 'savings') return b.kind === 'goal' || b.kind === 'emergency'
      return false
    })
    .map((b) => ({ key: `bucket-${b.id}`, label: `${b.name} (per paycheck)`, amount: b.per_paycheck }))

  return [...billItems, ...bucketItems]
}

function formatBand(min: number, max: number): string {
  return min === max ? `~${min}%` : `${min}-${max}%`
}

interface CspBreakdownViewProps {
  breakdown: CspBreakdownResult
  bills: Bill[]
  buckets: Bucket[]
}

export function CspBreakdownView({ breakdown, bills, buckets }: CspBreakdownViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Monthly income</span>
          <span className="text-lg font-semibold">
            {formatAmount(breakdown.monthlyIncome, 'fixed')}
          </span>
        </CardContent>
      </Card>

      {breakdown.overCommitted && (
        <p className="text-sm font-medium text-destructive">
          Fixed, investment, and savings targets add up to more than your income — guilt-free
          spending is $0 until something changes.
        </p>
      )}

      {CATEGORY_ORDER.map((category) => {
        const result = breakdown[category]
        const items = categoryItems(category, bills, buckets)
        return (
          <Card key={category}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>{CSP_BUCKET_LABELS[category]}</CardTitle>
                <span
                  className={cn(
                    'text-sm font-medium',
                    result.status === 'over' && 'text-destructive',
                  )}
                >
                  {STATUS_LABEL[result.status]}
                </span>
              </div>
              <CardDescription>
                {formatAmount(result.actual, 'fixed')} / month · {result.percent.toFixed(1)}%
                (target {formatBand(result.targetMin, result.targetMax)})
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full transition-all', STATUS_BAR_COLOR[result.status])}
                  style={{ width: `${Math.min(100, result.percent)}%` }}
                />
              </div>
              {items.length > 0 && (
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {items.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{item.label}</span>
                      <span className="shrink-0">{formatAmount(item.amount, 'fixed')}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
