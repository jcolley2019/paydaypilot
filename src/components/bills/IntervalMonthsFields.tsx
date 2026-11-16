import { useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { intervalMonthsRule } from '@/components/bills/scanDraft'
import { isISODate } from '@/lib/billScan'
import {
  describeDueRule,
  isValidIntervalMonths,
  MAX_INTERVAL_MONTHS,
  MIN_INTERVAL_MONTHS,
} from '@/lib/dueRules'
import { cn } from '@/lib/utils'

const PRESETS: { value: string; label: string }[] = [
  { value: '3', label: '3 months' },
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months (yearly)' },
]

const CUSTOM = 'custom'

interface IntervalMonthsFieldsProps {
  months: string
  anchor: string
  onChange: (next: { months: string; anchor: string }) => void
  /** Smaller muted labels, for the import review cards. */
  compact?: boolean
  invalid?: boolean
}

/**
 * "Every few months / Yearly" inputs shared by the bill form and the import review:
 * an interval (3, 6, 12 or a custom 2–24) plus the most recent due date it counts from.
 */
export function IntervalMonthsFields({ months, anchor, onChange, compact, invalid }: IntervalMonthsFieldsProps) {
  const id = useId()
  const [custom, setCustom] = useState(() => !PRESETS.some((p) => p.value === months))
  const rule = intervalMonthsRule(months, anchor)
  const labelClass = compact ? 'text-xs font-normal text-muted-foreground' : undefined

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className={cn('flex min-w-0 flex-col gap-1.5', !custom && 'col-span-2')}>
          <Label htmlFor={`${id}-every`} className={labelClass}>
            Repeats every
          </Label>
          <Select
            value={custom ? CUSTOM : months}
            onValueChange={(value) => {
              if (value === CUSTOM) {
                setCustom(true)
                return
              }
              setCustom(false)
              onChange({ months: value, anchor })
            }}
          >
            <SelectTrigger id={`${id}-every`} className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM}>Custom…</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {custom && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`${id}-months`} className={labelClass}>
              Months ({MIN_INTERVAL_MONTHS}–{MAX_INTERVAL_MONTHS})
            </Label>
            <Input
              id={`${id}-months`}
              type="number"
              inputMode="numeric"
              min={MIN_INTERVAL_MONTHS}
              max={MAX_INTERVAL_MONTHS}
              step="1"
              required
              aria-invalid={invalid && !isValidIntervalMonths(Number(months)) ? true : undefined}
              value={months}
              onChange={(e) => onChange({ months: e.target.value, anchor })}
            />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${id}-anchor`} className={labelClass}>
          Most recent due date
        </Label>
        <Input
          id={`${id}-anchor`}
          type="date"
          required
          aria-invalid={invalid && !isISODate(anchor) ? true : undefined}
          value={anchor}
          onChange={(e) => onChange({ months, anchor: e.target.value })}
        />
      </div>

      {rule && <p className="text-xs text-muted-foreground">{describeDueRule(rule)}</p>}
    </div>
  )
}
