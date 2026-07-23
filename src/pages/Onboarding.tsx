import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Compass, ShieldCheck, Plus } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useIncomeSources } from '@/hooks/useIncomeSources'
import { useBills } from '@/hooks/useBills'
import { useBuckets } from '@/hooks/useBuckets'
import { IncomeSourceFormDialog } from '@/components/income/IncomeSourceFormDialog'
import { BillFormDialog } from '@/components/bills/BillFormDialog'
import { formatAmount } from '@/lib/billLabels'
import { describeSchedule } from '@/lib/scheduleLabels'
import { generatePayDates } from '@/lib/paydays'
import { suggestPerPaycheck } from '@/lib/bucketMath'
import { babyStepStatus } from '@/lib/plan'
import { addMonths, toISODate } from '@/lib/localDate'
import { BUCKET_COLORS } from '@/types/buckets'

type Philosophy = 'csp' | 'ramsey' | 'hybrid'

const STEP_TITLES = ['Welcome', 'Philosophy', 'Income', 'Bills', 'Emergency fund', 'Done']
const EMERGENCY_COLOR = BUCKET_COLORS[2]

const PHILOSOPHY_OPTIONS: Array<{
  value: Philosophy
  label: string
  description: string
  recommended?: boolean
}> = [
  {
    value: 'csp',
    label: 'Conscious Spending Plan',
    description:
      "Ramit Sethi's approach: split every paycheck into four percentage targets — fixed costs, investments, savings goals, and guilt-free spending — so you always know how much you can spend without guilt, because everything else is already covered.",
  },
  {
    value: 'ramsey',
    label: 'Baby Steps',
    description:
      "Dave Ramsey's approach: a strict, sequential playbook. Build a $1,000 starter emergency fund, throw every extra dollar at your debts smallest-balance-first until they're gone, then grow that fund to 3-6 months of expenses. Simple, but it asks for real short-term sacrifice.",
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
    description:
      "Ramsey's urgency for your safety net first — starter emergency fund, then debt payoff, then a full emergency fund — then CSP percentages for everything else once that foundation is solid. Recommended if you're not sure which one fits.",
    recommended: true,
  },
]

export function Onboarding() {
  const navigate = useNavigate()
  const { profile, updateProfile } = useAuth()
  const { incomeSources, createIncomeSource } = useIncomeSources()
  const { bills, createBill } = useBills()
  const { buckets, createBucket } = useBuckets()

  const [step, setStep] = useState(0)
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [philosophy, setPhilosophy] = useState<Philosophy>(
    (profile?.philosophy as Philosophy | null) ?? 'hybrid',
  )
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false)
  const [billDialogOpen, setBillDialogOpen] = useState(false)
  const [creatingEmergencyFund, setCreatingEmergencyFund] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const activeIncomeSources = incomeSources.filter((s) => s.active)
  const activeBillCount = bills.filter((b) => b.active).length
  const emergencyBucket = buckets.find((b) => b.kind === 'emergency')

  const sixMonthsOut = useMemo(() => addMonths(new Date(), 6), [])

  function emergencyFundTarget(): number {
    if (philosophy === 'ramsey' || philosophy === 'hybrid') return 1000
    const threeMonth = babyStepStatus(buckets, bills).threeMonthTarget
    return threeMonth > 0 ? threeMonth : 1000
  }

  function emergencyFundPerPaycheck(targetAmount: number): number {
    if (activeIncomeSources.length === 0) return 0
    const today = new Date()
    const payDates = Array.from(
      new Set(
        activeIncomeSources
          .flatMap((s) => generatePayDates(s, today, sixMonthsOut))
          .map((d) => toISODate(d)),
      ),
    ).sort()
    const suggestion = suggestPerPaycheck({
      targetAmount,
      targetDate: toISODate(sixMonthsOut),
      currentBalance: 0,
      payDates,
      today,
    })
    return suggestion ?? 0
  }

  async function handleCreateEmergencyFund() {
    setCreatingEmergencyFund(true)
    try {
      const targetAmount = emergencyFundTarget()
      await createBucket({
        name: 'Emergency Fund',
        icon: 'ShieldCheck',
        color: EMERGENCY_COLOR,
        kind: 'emergency',
        target_amount: targetAmount,
        target_date: null,
        per_paycheck: emergencyFundPerPaycheck(targetAmount),
        sort: 0,
        active: true,
      })
    } finally {
      setCreatingEmergencyFund(false)
    }
  }

  async function handleFinish() {
    setFinishing(true)
    try {
      await updateProfile({
        display_name: displayName.trim() || null,
        philosophy,
        onboarded: true,
      })
      navigate('/', { replace: true })
    } finally {
      setFinishing(false)
    }
  }

  function next() {
    setStep((s) => Math.min(s + 1, STEP_TITLES.length - 1))
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0))
  }

  return (
    <div className="flex min-h-svh flex-col items-center bg-background p-4 text-foreground">
      <div className="flex w-full max-w-lg flex-col items-center gap-6 py-10">
        <div className="flex flex-col items-center gap-2">
          <Compass className="size-8 text-primary" />
          <span className="text-xl font-semibold tracking-tight">PaydayPilot</span>
        </div>

        <div className="flex items-center gap-2">
          {STEP_TITLES.map((title, i) => (
            <span
              key={title}
              aria-label={title}
              className={cn(
                'size-2 rounded-full transition-colors',
                i === step ? 'bg-primary' : i < step ? 'bg-primary/50' : 'bg-muted',
              )}
            />
          ))}
        </div>

        <Card className="w-full">
          <CardContent className="flex flex-col gap-5">
            {step === 0 && (
              <>
                <CardHeader className="px-0">
                  <CardTitle>Welcome to PaydayPilot</CardTitle>
                  <CardDescription>
                    Let's build your payday plan. This takes about two minutes.
                  </CardDescription>
                </CardHeader>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="onboarding-name">What should we call you?</Label>
                  <Input
                    id="onboarding-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <CardHeader className="px-0">
                  <CardTitle>Pick your philosophy</CardTitle>
                  <CardDescription>
                    You can change this anytime from the Plan page.
                  </CardDescription>
                </CardHeader>
                <div className="flex flex-col gap-3">
                  {PHILOSOPHY_OPTIONS.map((option) => (
                    <Card
                      key={option.value}
                      role="button"
                      tabIndex={0}
                      onClick={() => setPhilosophy(option.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setPhilosophy(option.value)
                      }}
                      className={cn(
                        'cursor-pointer transition-colors',
                        philosophy === option.value
                          ? 'ring-2 ring-primary'
                          : 'ring-1 ring-foreground/10 hover:ring-foreground/20',
                      )}
                    >
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <CardTitle>{option.label}</CardTitle>
                          {option.recommended && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              Recommended
                            </span>
                          )}
                        </div>
                        <CardDescription>{option.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <CardHeader className="px-0">
                  <CardTitle>When do you get paid?</CardTitle>
                  <CardDescription>
                    PaydayPilot maps every bill to the paycheck that covers it.
                  </CardDescription>
                </CardHeader>

                {activeIncomeSources.length === 0 ? (
                  <div className="flex flex-col items-start gap-3">
                    <p className="text-sm text-muted-foreground">
                      Add at least one income source to build your plan. You can add more later
                      in Settings.
                    </p>
                    <Button type="button" onClick={() => setIncomeDialogOpen(true)}>
                      <Plus className="size-4" />
                      Add income source
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {activeIncomeSources.map((source) => (
                      <div
                        key={source.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-input px-3 py-2"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{source.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {describeSchedule(source)}
                          </span>
                        </div>
                        <span className="text-sm">{formatAmount(source.net_amount, 'fixed')}</span>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="self-start"
                      onClick={() => setIncomeDialogOpen(true)}
                    >
                      <Plus className="size-4" />
                      Add another
                    </Button>
                  </div>
                )}

                <IncomeSourceFormDialog
                  open={incomeDialogOpen}
                  onOpenChange={setIncomeDialogOpen}
                  onSubmit={createIncomeSource}
                />
              </>
            )}

            {step === 3 && (
              <>
                <CardHeader className="px-0">
                  <CardTitle>Add your bills</CardTitle>
                  <CardDescription>
                    You have {activeBillCount} active bill{activeBillCount === 1 ? '' : 's'}. Add
                    bills now, or skip and add them later — either way you can continue.
                  </CardDescription>
                </CardHeader>
                <Button
                  type="button"
                  variant="outline"
                  className="self-start"
                  onClick={() => setBillDialogOpen(true)}
                >
                  <Plus className="size-4" />
                  Add a bill
                </Button>
              </>
            )}

            {step === 4 && (
              <>
                <CardHeader className="px-0">
                  <CardTitle>Start your emergency fund</CardTitle>
                  <CardDescription>
                    A starter cushion comes first in every philosophy.
                  </CardDescription>
                </CardHeader>

                {emergencyBucket ? (
                  <div className="flex items-center gap-3 rounded-lg border border-input px-3 py-3">
                    <ShieldCheck className="size-5 text-primary" />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{emergencyBucket.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatAmount(emergencyBucket.current_balance, 'fixed')}
                        {emergencyBucket.target_amount != null &&
                          ` of ${formatAmount(emergencyBucket.target_amount, 'fixed')}`}{' '}
                        · {formatAmount(emergencyBucket.per_paycheck, 'fixed')} / paycheck
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-start gap-3">
                    <p className="text-sm text-muted-foreground">
                      One tap creates an emergency fund bucket with a target and a suggested
                      per-paycheck contribution based on your income.
                    </p>
                    <Button
                      type="button"
                      onClick={handleCreateEmergencyFund}
                      disabled={creatingEmergencyFund}
                    >
                      <ShieldCheck className="size-4" />
                      {creatingEmergencyFund ? 'Creating…' : 'Create my emergency fund'}
                    </Button>
                  </div>
                )}
              </>
            )}

            {step === 5 && (
              <>
                <CardHeader className="px-0">
                  <CardTitle>You're all set</CardTitle>
                  <CardDescription>
                    {PHILOSOPHY_OPTIONS.find((o) => o.value === philosophy)?.label} is your plan.
                    Head to the dashboard to see your next paychecks.
                  </CardDescription>
                </CardHeader>
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex w-full items-center justify-between">
          <Button type="button" variant="outline" onClick={back} disabled={step === 0}>
            Back
          </Button>
          {step === STEP_TITLES.length - 1 ? (
            <Button type="button" onClick={handleFinish} disabled={finishing}>
              {finishing ? 'Finishing…' : 'Go to Dashboard'}
            </Button>
          ) : (
            <Button type="button" onClick={next}>
              Next
            </Button>
          )}
        </div>
      </div>

      <BillFormDialog open={billDialogOpen} onOpenChange={setBillDialogOpen} onSubmit={createBill} />
    </div>
  )
}
