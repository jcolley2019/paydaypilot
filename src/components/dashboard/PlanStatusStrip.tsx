import { Link } from 'react-router-dom'
import { Map } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CSP_BUCKET_LABELS } from '@/lib/billLabels'
import type { CspBreakdownResult, CspCategory } from '@/lib/plan'

type Philosophy = 'csp' | 'ramsey' | 'hybrid'

const PHILOSOPHY_LABELS: Record<Philosophy, string> = {
  csp: 'Conscious Spending',
  ramsey: 'Baby Steps',
  hybrid: 'Hybrid',
}

interface PlanStatusStripProps {
  philosophy: Philosophy
  breakdown: CspBreakdownResult
  worstCategory: CspCategory | null
  nextAction: string
}

export function PlanStatusStrip({
  philosophy,
  breakdown,
  worstCategory,
  nextAction,
}: PlanStatusStripProps) {
  const message =
    philosophy === 'csp'
      ? worstCategory
        ? `${CSP_BUCKET_LABELS[worstCategory]} is ${breakdown[worstCategory].status === 'over' ? 'over' : 'under'} target`
        : 'Your plan is on target'
      : nextAction

  return (
    <Link
      to="/plan"
      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-accent/50"
    >
      <Badge variant="secondary">{PHILOSOPHY_LABELS[philosophy]}</Badge>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{message}</span>
      <Map className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}
