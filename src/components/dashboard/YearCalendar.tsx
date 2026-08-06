import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CalendarMarker } from '@/components/dashboard/CalendarMarker'
import { buildCalendarDays, monthGridDates } from '@/lib/calendar'
import { toISODate } from '@/lib/localDate'
import type { PaycheckWithSource, BillInstanceWithBill } from '@/hooks/usePaydayEngine'
import type { IncomeSource } from '@/types/payday'
import type { Bill } from '@/types/bills'

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

interface YearCalendarProps {
  year: number
  onNavigateYear: (delta: number) => void
  onSelectMonth: (month0: number) => void
  incomeSources: IncomeSource[]
  bills: Bill[]
  paychecks: PaycheckWithSource[]
  instances: BillInstanceWithBill[]
}

export function YearCalendar({
  year,
  onNavigateYear,
  onSelectMonth,
  incomeSources,
  bills,
  paychecks,
  instances,
}: YearCalendarProps) {
  const calendarDays = useMemo(
    () =>
      buildCalendarDays({
        incomeSources,
        bills,
        realPaychecks: paychecks,
        realInstances: instances,
        from: new Date(year, 0, 1),
        to: new Date(year, 11, 31),
      }),
    [incomeSources, bills, paychecks, instances, year],
  )

  const todayISO = useMemo(() => toISODate(new Date()), [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="pp-display text-lg">{year}</h2>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-9"
            aria-label="Previous year"
            onClick={() => onNavigateYear(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-9"
            aria-label="Next year"
            onClick={() => onNavigateYear(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {MONTH_NAMES.map((label, month0) => {
          const grid = monthGridDates(year, month0)
          return (
            <div
              key={label}
              role="button"
              tabIndex={0}
              aria-label={`View ${label} ${year}`}
              onClick={() => onSelectMonth(month0)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelectMonth(month0)
              }}
              className="flex cursor-pointer flex-col gap-2 rounded-xl bg-card p-3 text-card-foreground ring-1 ring-foreground/10 outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="pp-label text-sm font-medium">{label}</span>
              <div className="grid grid-cols-7 gap-0.5">
                {grid.map((date) => {
                  const inMonth = date.getMonth() === month0
                  const iso = toISODate(date)
                  const day = calendarDays.get(iso)
                  const hasPayday = !!day?.paydays.length
                  const hasBill = !!day?.bills.length
                  return (
                    <div
                      key={iso}
                      className={cn(
                        'flex h-2.5 items-center justify-center gap-0.5',
                        !inMonth && 'invisible',
                        iso === todayISO && inMonth && 'rounded-full ring-2 ring-pp-today',
                      )}
                    >
                      {hasPayday && <CalendarMarker kind="payday" size="xs" />}
                      {hasBill && <CalendarMarker kind="bill-due" size="xs" />}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
