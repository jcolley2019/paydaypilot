import { Pencil, Trash2, Zap } from 'lucide-react'
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
import { describeDueRule, nextDueDate } from '@/lib/dueRules'
import { CATEGORY_LABELS, formatAmount } from '@/lib/billLabels'
import type { Bill } from '@/types/bills'

interface BillCardProps {
  bill: Bill
  onEdit: (bill: Bill) => void
  onDelete: (id: string) => void
}

export function BillCard({ bill, onEdit, onDelete }: BillCardProps) {
  const next = nextDueDate(bill.due_rule, new Date())

  return (
    <Card className={cn(!bill.active && 'opacity-60')}>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{bill.name}</span>
            <Badge variant="outline">{CATEGORY_LABELS[bill.category]}</Badge>
            {!bill.active && <Badge variant="secondary">Paused</Badge>}
            {bill.autopay && (
              <Badge variant="secondary" className="gap-1">
                <Zap className="size-3" />
                Autopay
              </Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {formatAmount(bill.amount, bill.amount_type)} · {describeDueRule(bill.due_rule)}
          </div>
          <div className="text-sm text-muted-foreground">
            {next
              ? `Next: ${next.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : 'No upcoming due date'}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${bill.name}`}
            onClick={() => onEdit(bill)}
          >
            <Pencil className="size-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${bill.name}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{bill.name}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  This can't be undone. The bill will be permanently removed from your vault.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => onDelete(bill.id)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  )
}
