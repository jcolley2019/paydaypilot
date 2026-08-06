import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { formatAmount } from '@/lib/billLabels'
import { buildCalendarDays, monthGridDates } from '@/lib/calendar'
import { addMonths, parseISODate, toISODate } from '@/lib/localDate'
import type { PaycheckWithSource, BillInstanceWithBill } from '@/hooks/usePaydayEngine'
import type { IncomeSource } from '@/types/payday'
import type { Bill } from '@/types/bills'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatDayLabel(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function formatShortDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface MonthCalendarProps {
  year: number
  month0: number
  onNavigate: (next: { year: number; month0: number }) => void
  incomeSources: IncomeSource[]
  bills: Bill[]
  paychecks: PaycheckWithSource[]
  instances: BillInstanceWithBill[]
}

export function MonthCalendar({
  year,
  month0,
  onNavigate,
  incomeSources,
  bills,
  paychecks,
  instances,
}: MonthCalendarProps) {
  const grid = useMemo(() => monthGridDates(year, month0), [year, month0])
  const todayISO = useMemo(() => toISODate(new Date()), [])

  const calendarDays = useMemo(
    () =>
      buildCalendarDays({
        incomeSources,
        bills,
        realPaychecks: paychecks,
        realInstances: instances,
        from: grid[0],
        to: grid[grid.length - 1],
      }),
    [incomeSources, bills, paychecks, instances, grid],
  )

  const paycheckById = useMemo(() => new Map(paychecks.map((p) => [p.id, p])), [paychecks])

  function paycheckLabel(paycheckId: string): string {
    const pc = paycheckById.get(paycheckId)
    return pc ? `${formatShortDate(pc.pay_date)} (${pc.sourceName})` : ''
  }

  function goToMonth(delta: number) {
    const next = addMonths(new Date(year, month0, 1), delta)
    onNavigate({ year: next.getFullYear(), month0: next.getMonth() })
  }

  function goToToday() {
    const today = new Date()
    onNavigate({ year: today.getFullYear(), month0: today.getMonth() })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">
          {MONTH_NAMES[month0]} {year}
        </h2>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Previous month"
            onClick={() => goToMonth(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Next month"
            onClick={() => goToMonth(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((date) => {
          const iso = toISODate(date)
          const inMonth = date.getMonth() === month0
          const isToday = iso === todayISO
          const day = calendarDays.get(iso)
          const hasContent = !!day && (day.paydays.length > 0 || day.bills.length > 0)

          return (
            <Popover key={iso}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={!hasContent}
                  aria-label={formatDayLabel(iso)}
                  className={cn(
                    'flex min-h-16 flex-col items-start gap-1 rounded-md p-1.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    inMonth ? 'text-foreground' : 'text-muted-foreground/50',
                    hasContent ? 'hover:bg-accent/50' : 'cursor-default',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-5 items-center justify-center rounded-full text-xs font-medium',
                      isToday && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {date.getDate()}
                  </span>
                  {day && (
                    <div className="flex flex-wrap items-center gap-1">
                      {day.paydays.map((p, i) => (
                        <span
                          key={`p-${i}`}
                          className={cn('size-1.5 rounded-full bg-emerald-500', !p.real && 'opacity-40')}
                        />
                      ))}
                      {day.bills.slice(0, 4).map((b, i) => (
                        <span
                          key={`b-${i}`}
                          className={cn(
                            'size-1.5 rounded-full',
                            b.status === 'paid' ? 'bg-muted-foreground' : 'bg-sky-500',
                            !b.real && 'opacity-40',
                          )}
                        />
                      ))}
                      {day.bills.length > 4 && (
                        <span className="text-[10px] leading-none text-muted-foreground">
                          +{day.bills.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              </PopoverTrigger>
              {hasContent && day && (
                <PopoverContent className="w-72" align="start">
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium">{formatDayLabel(iso)}</p>

                    {day.paydays.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">Paydays</span>
                        {day.paydays.map((p, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 text-sm">
                            <span className={cn(!p.real && 'text-muted-foreground')}>
                              {p.sourceName}
                              {!p.real && ' · projected'}
                            </span>
                            <span>{formatAmount(p.amount, 'fixed')}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {day.bills.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">Bills</span>
                        {day.bills.map((b, i) => (
                          <div key={i} className="flex flex-col gap-0.5 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={cn(
                                  (b.status === 'paid' || !b.real) && 'text-muted-foreground',
                                  b.status === 'paid' && 'line-through',
                                )}
                              >
                                {b.billName}
                              </span>
                              <span>{formatAmount(b.amount, b.amountType)}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {b.dueRuleLabel}
                              {!b.real && ' · projected'}
                              {b.real && b.status === 'paid' && ' · Paid'}
                              {b.real && b.paycheckId && ` · from ${paycheckLabel(b.paycheckId)}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              )}
            </Popover>
          )
        })}
      </div>
    </div>
  )
}
