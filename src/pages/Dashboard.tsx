import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useIncomeSources } from '@/hooks/useIncomeSources'
import { usePaydayEngine } from '@/hooks/usePaydayEngine'
import { PaycheckCard } from '@/components/dashboard/PaycheckCard'

const VISIBLE_PAYCHECKS = 4

export function Dashboard() {
  const { incomeSources, loading: incomeLoading } = useIncomeSources()
  const { paychecks, instances, loading, markPaid, markUnpaid, reassign } = usePaydayEngine()

  const upcoming = paychecks.slice(0, VISIBLE_PAYCHECKS)

  if (!incomeLoading && incomeSources.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Card>
          <CardHeader>
            <CardTitle>Add your income to see your paycheck plan</CardTitle>
            <CardDescription>
              PaydayPilot maps your bills to your paychecks once it knows when you get paid.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/settings">Go to Settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your next {VISIBLE_PAYCHECKS} paychecks</p>
      </div>

      {!loading && upcoming.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No upcoming paychecks</CardTitle>
            <CardDescription>
              Check your income schedule in Settings, or add a manual paycheck.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {upcoming.map((paycheck) => (
          <PaycheckCard
            key={paycheck.id}
            paycheck={paycheck}
            instances={instances.filter((i) => i.paycheck_id === paycheck.id)}
            otherPaychecks={paychecks.filter((pc) => pc.id !== paycheck.id)}
            onMarkPaid={markPaid}
            onMarkUnpaid={markUnpaid}
            onReassign={reassign}
          />
        ))}
      </div>
    </div>
  )
}
