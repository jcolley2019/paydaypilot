import { useMemo, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useIncomeSources } from '@/hooks/useIncomeSources'
import { useBills } from '@/hooks/useBills'
import { useBuckets } from '@/hooks/useBuckets'
import { usePaydayEngine } from '@/hooks/usePaydayEngine'
import {
  cspBreakdown,
  babyStepStatus,
  snowballOrder,
  findOversubscribedPaycheck,
  suggestOversubscriptionFixes,
} from '@/lib/plan'
import { CspBreakdownView } from '@/components/plan/CspBreakdownView'
import { BabyStepsStepper } from '@/components/plan/BabyStepsStepper'
import { SnowballList } from '@/components/plan/SnowballList'
import { OversubscriptionAdvisor } from '@/components/plan/OversubscriptionAdvisor'

type Philosophy = 'csp' | 'ramsey' | 'hybrid'

const PHILOSOPHY_LABELS: Record<Philosophy, string> = {
  csp: 'Conscious Spending Plan',
  ramsey: 'Baby Steps',
  hybrid: 'Hybrid',
}

const PHILOSOPHIES: Philosophy[] = ['csp', 'ramsey', 'hybrid']

export function Plan() {
  const { profile, updateProfile } = useAuth()
  const { incomeSources } = useIncomeSources()
  const { bills } = useBills()
  const { buckets } = useBuckets()
  const { paychecks, instances } = usePaydayEngine()

  const philosophy: Philosophy = (profile?.philosophy as Philosophy | null) ?? 'hybrid'

  const breakdown = useMemo(
    () => cspBreakdown(bills, buckets, incomeSources),
    [bills, buckets, incomeSources],
  )
  const babySteps = useMemo(() => babyStepStatus(buckets, bills), [buckets, bills])
  const { snowball, avalanche } = useMemo(() => snowballOrder(bills), [bills])

  const billTotalByPaycheck = useMemo(() => {
    const map = new Map<string, number>()
    for (const instance of instances) {
      if (!instance.paycheck_id) continue
      map.set(instance.paycheck_id, (map.get(instance.paycheck_id) ?? 0) + instance.amount)
    }
    return map
  }, [instances])

  const bucketContributionTotal = useMemo(
    () => buckets.filter((b) => b.active).reduce((sum, b) => sum + b.per_paycheck, 0),
    [buckets],
  )

  const oversubscribed = useMemo(
    () => findOversubscribedPaycheck(paychecks, billTotalByPaycheck, bucketContributionTotal),
    [paychecks, billTotalByPaycheck, bucketContributionTotal],
  )

  const suggestions = useMemo(() => {
    if (!oversubscribed) return []
    const flexible = instances
      .filter((i) => i.paycheck_id === oversubscribed.paycheckId)
      .map((i) => ({ id: i.id, billName: i.billName, amount: i.amount }))
    return suggestOversubscriptionFixes(oversubscribed.amountOver, buckets, flexible)
  }, [oversubscribed, buckets, instances])

  async function handlePhilosophyChange(value: Philosophy) {
    await updateProfile({ philosophy: value })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plan</h1>
          <p className="text-sm text-muted-foreground">Your money philosophy, in action.</p>
        </div>
        <Select value={philosophy} onValueChange={(v) => handlePhilosophyChange(v as Philosophy)}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PHILOSOPHIES.map((p) => (
              <SelectItem key={p} value={p}>
                {PHILOSOPHY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {oversubscribed && (
        <OversubscriptionAdvisor paycheck={oversubscribed} suggestions={suggestions} />
      )}

      {philosophy === 'csp' && (
        <CspBreakdownView breakdown={breakdown} bills={bills} buckets={buckets} />
      )}

      {philosophy === 'ramsey' && (
        <>
          <BabyStepsStepper status={babySteps} />
          {babySteps.currentStep === 2 && (
            <SnowballList snowball={snowball} avalanche={avalanche} />
          )}
        </>
      )}

      {philosophy === 'hybrid' && (
        <HybridPlan
          babySteps={babySteps}
          snowball={snowball}
          avalanche={avalanche}
          breakdown={breakdown}
          bills={bills}
          buckets={buckets}
        />
      )}
    </div>
  )
}

function HybridPlan({
  babySteps,
  snowball,
  avalanche,
  breakdown,
  bills,
  buckets,
}: {
  babySteps: ReturnType<typeof babyStepStatus>
  snowball: ReturnType<typeof snowballOrder>['snowball']
  avalanche: ReturnType<typeof snowballOrder>['avalanche']
  breakdown: ReturnType<typeof cspBreakdown>
  bills: Parameters<typeof cspBreakdown>[0]
  buckets: Parameters<typeof cspBreakdown>[1]
}) {
  const cspVisible = babySteps.step3Done
  return (
    <>
      <BabyStepsStepper status={babySteps} />
      {babySteps.currentStep === 2 && <SnowballList snowball={snowball} avalanche={avalanche} />}
      {cspVisible ? (
        <CspBreakdownView breakdown={breakdown} bills={bills} buckets={buckets} />
      ) : (
        <HybridCspToggle breakdown={breakdown} bills={bills} buckets={buckets} />
      )}
    </>
  )
}

function HybridCspToggle({
  breakdown,
  bills,
  buckets,
}: {
  breakdown: ReturnType<typeof cspBreakdown>
  bills: Parameters<typeof cspBreakdown>[0]
  buckets: Parameters<typeof cspBreakdown>[1]
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Spending breakdown</h2>
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Hide' : 'Show'} CSP breakdown
        </Button>
      </div>
      {expanded && <CspBreakdownView breakdown={breakdown} bills={bills} buckets={buckets} />}
    </div>
  )
}
