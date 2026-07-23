import { Check } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatAmount } from '@/lib/billLabels'
import type { BabyStepStatusResult } from '@/lib/plan'

interface StepDef {
  step: number
  title: string
  description: string
}

const STEP_DEFS: StepDef[] = [
  { step: 1, title: 'Starter emergency fund', description: '$1,000 saved' },
  { step: 2, title: 'Debt snowball', description: 'Pay off all non-mortgage debt' },
  { step: 3, title: 'Full emergency fund', description: '3 months of fixed expenses' },
  { step: 4, title: 'Invest & build wealth', description: '15% of household income' },
]

interface BabyStepsStepperProps {
  status: BabyStepStatusResult
}

export function BabyStepsStepper({ status }: BabyStepsStepperProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Baby Steps</CardTitle>
        <CardDescription>{status.nextAction}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {STEP_DEFS.map((def) => {
          const isDone =
            (def.step === 1 && status.step1Done) ||
            (def.step === 2 && status.step2Done) ||
            (def.step === 3 && status.step3Done)
          const isCurrent = def.step === status.currentStep
          const progressPercent =
            status.progress.target > 0
              ? Math.min(100, (status.progress.current / status.progress.target) * 100)
              : 0

          return (
            <div key={def.step} className="flex items-start gap-3">
              <div
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                  isDone
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500'
                    : isCurrent
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground',
                )}
              >
                {isDone ? <Check className="size-4" /> : def.step}
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <span
                  className={cn(
                    'text-sm font-medium',
                    !isDone && !isCurrent && 'text-muted-foreground',
                  )}
                >
                  {def.title}
                </span>
                <span className="text-xs text-muted-foreground">{def.description}</span>
                {isCurrent && def.step !== 4 && (
                  <div className="mt-1 flex flex-col gap-1">
                    <div className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {def.step === 2
                        ? `${status.progress.current} of ${status.progress.target} debts paid off`
                        : `${formatAmount(status.progress.current, 'fixed')} of ${formatAmount(status.progress.target, 'fixed')}`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
