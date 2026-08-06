import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { useIncomeSources } from '@/hooks/useIncomeSources'
import { usePaydayEngine } from '@/hooks/usePaydayEngine'
import { useBuckets } from '@/hooks/useBuckets'
import { useBills } from '@/hooks/useBills'
import { PaycheckCard } from '@/components/dashboard/PaycheckCard'
import { PlanStatusStrip } from '@/components/dashboard/PlanStatusStrip'
import { MonthCalendar } from '@/components/dashboard/MonthCalendar'
import { YearCalendar } from '@/components/dashboard/YearCalendar'
import { cspBreakdown, worstCspCategory, babyStepStatus } from '@/lib/plan'

const VISIBLE_PAYCHECKS = 4

type DashboardTab = 'month' | 'paychecks' | 'year'

function isDashboardTab(value: string | null): value is DashboardTab {
  return value === 'month' || value === 'paychecks' || value === 'year'
}

export function Dashboard() {
  const { profile } = useAuth()
  const { incomeSources, loading: incomeLoading } = useIncomeSources()
  const { paychecks, instances, loading, markPaid, markUnpaid, reassign } = usePaydayEngine()
  const { buckets, entries, addEntry } = useBuckets()
  const { bills } = useBills()

  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: DashboardTab = isDashboardTab(tabParam) ? tabParam : 'month'

  const [viewedMonth, setViewedMonth] = useState(() => {
    const today = new Date()
    return { year: today.getFullYear(), month0: today.getMonth() }
  })

  function handleTabChange(value: string) {
    setSearchParams(
      (params) => {
        if (value === 'month') params.delete('tab')
        else params.set('tab', value)
        return params
      },
      { replace: true },
    )
  }

  function handleSelectMonth(month0: number) {
    setViewedMonth((v) => ({ ...v, month0 }))
    handleTabChange('month')
  }

  function handleNavigateYear(delta: number) {
    setViewedMonth((v) => ({ ...v, year: v.year + delta }))
  }

  const philosophy = (profile?.philosophy as 'csp' | 'ramsey' | 'hybrid' | null) ?? 'hybrid'
  const breakdown = useMemo(
    () => cspBreakdown(bills, buckets, incomeSources),
    [bills, buckets, incomeSources],
  )
  const worstCategory = useMemo(() => worstCspCategory(breakdown), [breakdown])
  const babySteps = useMemo(() => babyStepStatus(buckets, bills), [buckets, bills])

  const upcoming = paychecks.slice(0, VISIBLE_PAYCHECKS)

  if (!incomeLoading && incomeSources.length === 0) {
    return (
      <div className="flex flex-col gap-(--pp-page-gap)">
        <h1 className="pp-display text-2xl">Dashboard</h1>
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
    <div className="flex flex-col gap-(--pp-page-gap)">
      <div>
        <h1 className="pp-display pp-underline text-2xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your payday plan</p>
      </div>

      <PlanStatusStrip
        philosophy={philosophy}
        breakdown={breakdown}
        worstCategory={worstCategory}
        nextAction={babySteps.nextAction}
      />

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="paychecks">Paychecks</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
        </TabsList>

        <TabsContent value="month">
          <MonthCalendar
            year={viewedMonth.year}
            month0={viewedMonth.month0}
            onNavigate={setViewedMonth}
            incomeSources={incomeSources}
            bills={bills}
            paychecks={paychecks}
            instances={instances}
          />
        </TabsContent>

        <TabsContent value="paychecks" className="flex flex-col gap-4">
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

          {upcoming.map((paycheck) => (
            <PaycheckCard
              key={paycheck.id}
              paycheck={paycheck}
              instances={instances.filter((i) => i.paycheck_id === paycheck.id)}
              otherPaychecks={paychecks.filter((pc) => pc.id !== paycheck.id)}
              buckets={buckets}
              entries={entries}
              onMarkPaid={markPaid}
              onMarkUnpaid={markUnpaid}
              onReassign={reassign}
              onLogContribution={(bucketId, paycheckId, amount) =>
                addEntry(bucketId, amount, 'Paycheck contribution', paycheckId)
              }
            />
          ))}
        </TabsContent>

        <TabsContent value="year">
          <YearCalendar
            year={viewedMonth.year}
            onNavigateYear={handleNavigateYear}
            onSelectMonth={handleSelectMonth}
            incomeSources={incomeSources}
            bills={bills}
            paychecks={paychecks}
            instances={instances}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
