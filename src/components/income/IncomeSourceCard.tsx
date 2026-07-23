import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { describeSchedule } from '@/lib/scheduleLabels'
import { formatAmount } from '@/lib/billLabels'
import { ManualPaycheckForm } from '@/components/income/ManualPaycheckForm'
import type { IncomeSource } from '@/types/payday'

interface IncomeSourceCardProps {
  source: IncomeSource
  onEdit: (source: IncomeSource) => void
  onDelete: (id: string) => void
  onAddManualPaycheck: (incomeSourceId: string, payDate: string, amount: number) => Promise<void>
}

export function IncomeSourceCard({
  source,
  onEdit,
  onDelete,
  onAddManualPaycheck,
}: IncomeSourceCardProps) {
  const [showManualForm, setShowManualForm] = useState(false)

  return (
    <Card className={cn(!source.active && 'opacity-60')}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{source.name}</span>
              {!source.active && <Badge variant="secondary">Paused</Badge>}
            </div>
            <div className="text-sm text-muted-foreground">
              {formatAmount(source.net_amount, 'fixed')} · {describeSchedule(source)}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${source.name}`}
              onClick={() => onEdit(source)}
            >
              <Pencil className="size-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${source.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{source.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This can't be undone. Future paychecks from this source will be removed from
                    your plan.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => onDelete(source.id)}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {source.schedule === 'irregular' && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            {showManualForm ? (
              <ManualPaycheckForm
                onAdd={async (payDate, amount) => {
                  await onAddManualPaycheck(source.id, payDate, amount)
                  setShowManualForm(false)
                }}
              />
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setShowManualForm(true)}
              >
                Add paycheck
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
