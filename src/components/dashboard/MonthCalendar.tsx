import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarMarker } from '@/components/dashboard/CalendarMarker'
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

  const gridRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const todayIndex = grid.findIndex((d) => toISODate(d) === todayISO)
    setActiveIndex(todayIndex >= 0 ? todayIndex : 0)
  }, [grid, todayISO])

  function handleGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const indexAttr = (e.target as HTMLElement).getAttribute('data-day-index')
    if (indexAttr === null) return
    const delta =
      e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : e.key === 'ArrowDown' ? 7 : null
    if (delta === null) return
    const nextIndex = Number(indexAttr) + delta
    if (nextIndex < 0 || nextIndex >= grid.length) return
    e.preventDefault()
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day-index="${nextIndex}"]`)?.focus()
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
          <Button type="button" variant="outline" size="sm" className="h-9" onClick={goToToday}>
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-9"
            aria-label="Previous month"
            onClick={() => goToMonth(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-9"
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

      <div ref={gridRef} className="grid grid-cols-7 gap-1" onKeyDown={handleGridKeyDown}>
        {grid.map((date, index) => {
          const iso = toISODate(date)
          const inMonth = date.getMonth() === month0
          const isToday = iso === todayISO
          const day = calendarDays.get(iso)
          const hasContent = !!day && (day.paydays.length > 0 || day.bills.length > 0)
          const tabIndex = index === activeIndex ? 0 : -1

          const buttonClassName = cn(
            'flex min-h-16 flex-col items-start gap-1 rounded-md p-1.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            inMonth ? 'text-foreground' : 'text-muted-foreground/50',
            hasContent ? 'hover:bg-accent/50' : 'cursor-default',
          )

          const buttonContent = (
            <>
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
                    <CalendarMarker key={`p-${i}`} kind="payday" weight={p.real ? 'solid' : 'ghost'} />
                  ))}
                  {day.bills.slice(0, 4).map((b, i) => (
                    <CalendarMarker
                      key={`b-${i}`}
                      kind={b.status === 'paid' ? 'bill-paid' : 'bill-due'}
                      weight={b.real ? 'solid' : 'ghost'}
                    />
                  ))}
                  {day.bills.length > 4 && (
                    <span className="text-xs leading-none font-medium text-muted-foreground">
                      +{day.bills.length - 4}
                    </span>
                  )}
                </div>
              )}
            </>
          )

          if (!hasContent) {
            return (
              <button
                key={iso}
                type="button"
                data-day-index={index}
                tabIndex={tabIndex}
                onFocus={() => setActiveIndex(index)}
                aria-label={formatDayLabel(iso)}
                className={buttonClassName}
              >
                {buttonContent}
              </button>
            )
          }

          return (
            <Popover key={iso}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-day-index={index}
                  tabIndex={tabIndex}
                  onFocus={() => setActiveIndex(index)}
                  aria-label={formatDayLabel(iso)}
                  className={buttonClassName}
                >
                  {buttonContent}
                </button>
              </PopoverTrigger>
              {day && (
                <PopoverContent className="w-72 max-w-[calc(100vw-2rem)]" align="start">
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
