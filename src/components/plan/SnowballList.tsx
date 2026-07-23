import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { formatAmount } from '@/lib/billLabels'
import type { Bill } from '@/types/bills'

interface SnowballListProps {
  snowball: Bill[]
  avalanche: Bill[]
}

export function SnowballList({ snowball, avalanche }: SnowballListProps) {
  const [avalancheMode, setAvalancheMode] = useState(false)

  if (snowball.length === 0) return null

  const list = avalancheMode ? avalanche : snowball

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Debt payoff order</CardTitle>
          <div className="flex items-center gap-2">
            <Switch
              id="avalanche-mode"
              checked={avalancheMode}
              onCheckedChange={setAvalancheMode}
            />
            <Label htmlFor="avalanche-mode" className="text-sm font-normal text-muted-foreground">
              Nerd mode: highest APR first
            </Label>
          </div>
        </div>
        <CardDescription>
          {avalancheMode
            ? 'Avalanche: pay minimums on everything, attack the highest-APR debt first — saves the most interest.'
            : `Pay minimums on all debts, attack "${list[0].name}" with everything extra — smallest balance first for quick wins.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border">
        {list.map((bill, i) => (
          <div key={bill.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {i + 1}
              </span>
              <span className="min-w-0 truncate">{bill.name}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-muted-foreground">
              <span>{formatAmount(bill.debt_balance ?? 0, 'fixed')}</span>
              {bill.debt_apr != null && <span>{bill.debt_apr}% APR</span>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
