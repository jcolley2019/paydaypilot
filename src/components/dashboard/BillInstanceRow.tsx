import { AlertTriangle, Check, MoreVertical, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatAmount } from '@/lib/billLabels'
import { parseISODate } from '@/lib/localDate'
import type { BillInstanceWithBill, PaycheckWithSource } from '@/hooks/usePaydayEngine'

function formatDueDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface BillInstanceRowProps {
  instance: BillInstanceWithBill
  otherPaychecks: PaycheckWithSource[]
  onMarkPaid: (instanceId: string) => void
  onMarkUnpaid: (instanceId: string) => void
  onReassign: (instanceId: string, paycheckId: string) => void
}

export function BillInstanceRow({
  instance,
  otherPaychecks,
  onMarkPaid,
  onMarkUnpaid,
  onReassign,
}: BillInstanceRowProps) {
  const isPaid = instance.status === 'paid'

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {instance.alert === 'due_before_payday' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertTriangle className="size-4 shrink-0 text-amber-500" />
            </TooltipTrigger>
            <TooltipContent>Due before this payday arrives</TooltipContent>
          </Tooltip>
        )}
        <div className="flex min-w-0 flex-col">
          <span className={cn('truncate text-sm font-medium', isPaid && 'line-through opacity-60')}>
            {instance.billName}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatAmount(instance.amount, 'fixed')} · Due {formatDueDate(instance.due_date)}
          </span>
        </div>
        {isPaid && (
          <Badge variant="secondary" className="shrink-0">
            Paid
          </Badge>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isPaid ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Revert ${instance.billName} to unpaid`}
            onClick={() => onMarkUnpaid(instance.id)}
          >
            <Undo2 className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Mark ${instance.billName} as paid`}
            onClick={() => onMarkPaid(instance.id)}
          >
            <Check className="size-4" />
          </Button>
        )}

        {otherPaychecks.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Move ${instance.billName} to a different paycheck`}
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {otherPaychecks.map((pc) => (
                <DropdownMenuItem key={pc.id} onClick={() => onReassign(instance.id, pc.id)}>
                  Move to {formatDueDate(pc.pay_date)} ({pc.sourceName})
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
