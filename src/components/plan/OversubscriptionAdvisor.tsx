import { Link } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatAmount } from '@/lib/billLabels'
import { parseISODate } from '@/lib/localDate'
import type { OversubscribedPaycheck, OversubscriptionSuggestion } from '@/lib/plan'

function formatPayDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function describeSuggestion(s: OversubscriptionSuggestion): { text: string; href: string } {
  switch (s.type) {
    case 'reduce_bucket':
      return {
        text: `Reduce "${s.bucketName}" by ${formatAmount(s.reduceBy, 'fixed')} to ${formatAmount(s.newPerPaycheck, 'fixed')} per paycheck`,
        href: `/buckets?edit=${s.bucketId}`,
      }
    case 'move_bill':
      return {
        text: `Move "${s.billName}" (${formatAmount(s.amount, 'fixed')}) to the adjacent paycheck`,
        href: '/',
      }
    case 'extend_target_date':
      return {
        text: `Push out the target date on "${s.bucketName}" to lower its per-paycheck amount`,
        href: `/buckets?edit=${s.bucketId}`,
      }
  }
}

interface OversubscriptionAdvisorProps {
  paycheck: OversubscribedPaycheck
  suggestions: OversubscriptionSuggestion[]
}

export function OversubscriptionAdvisor({ paycheck, suggestions }: OversubscriptionAdvisorProps) {
  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TriangleAlert className="size-5 text-amber-500" />
          <CardTitle>Your {formatPayDate(paycheck.payDate)} paycheck is oversubscribed</CardTitle>
        </div>
        <CardDescription>
          Bills and savings add up to {formatAmount(paycheck.amountOver, 'fixed')} more than that
          paycheck. Here's how to fix it:
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {suggestions.map((s, i) => {
          const { text, href } = describeSuggestion(s)
          return (
            <div
              key={`${s.type}-${i}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-input px-3 py-2"
            >
              <span className="text-sm">{text}</span>
              <Button asChild type="button" variant="outline" size="sm">
                <Link to={href}>{i === 0 ? 'Fix it' : 'View'}</Link>
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
