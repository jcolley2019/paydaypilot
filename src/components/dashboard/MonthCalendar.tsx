import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarMarker } from '@/components/dashboard/CalendarMarker'
import { cn } from '@/lib/utils'
import { formatAmount } from '@/lib/billLabels'
import { buildCalendarDays, monthGridDates, numberPaychecksInMonth } from '@/lib/calendar'
import type { CalendarBillEntry, CalendarPaycheckLabel, CalendarPaydayEntry } from '@/lib/calendar'
import { addMonths, parseISODate, toISODate } from '@/lib/localDate'
import type { PaycheckWithSource, BillInstanceWithBill } from '@/hooks/usePaydayEngine'
import type { IncomeSource } from '@/types/payday'
import type { Bill } from '@/types/bills'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Fixed 4-hue palette cycling per check, so bill chips visually pair with their payday.
 * Hues are theme tokens (--pp-check-N) so each bake-off variant supplies scheme-compatible values. */
const CHECK_HUE_CLASSES = [
  'border-l-pp-check-1',
  'border-l-pp-check-2',
  'border-l-pp-check-3',
  'border-l-pp-check-4',
]
const NO_CHECK_HUE_CLASS = 'border-l-transparent'

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

  // Month-scoped "Check N" numbering + hue, keyed for lookup by payday (sourceId+date)
  // and by bill assignment (real paycheckId). Computed bills never carry a paycheckId,
  // so they naturally fall through to "no assignment" below.
  const checkLabels = useMemo(() => {
    const monthPaydays: CalendarPaydayEntry[] = []
    for (const day of calendarDays.values()) monthPaydays.push(...day.paydays)
    return numberPaychecksInMonth(monthPaydays, year, month0)
  }, [calendarDays, year, month0])

  const checkByKey = useMemo(() => new Map(checkLabels.map((c) => [c.key, c])), [checkLabels])
  const checkByPaycheckId = useMemo(() => {
    const map = new Map<string, CalendarPaycheckLabel>()
    for (const c of checkLabels) if (c.paycheckId) map.set(c.paycheckId, c)
    return map
  }, [checkLabels])

  function checkForPayday(p: CalendarPaydayEntry): CalendarPaycheckLabel | undefined {
    return checkByKey.get(`${p.sourceId}|${p.date}`)
  }

  function checkForBill(b: CalendarBillEntry): CalendarPaycheckLabel | undefined {
    return b.paycheckId ? checkByPaycheckId.get(b.paycheckId) : undefined
  }

  function hueClassFor(check: CalendarPaycheckLabel | undefined): string {
    if (!check) return NO_CHECK_HUE_CLASS
    const index = checkLabels.indexOf(check)
    return CHECK_HUE_CLASSES[index % CHECK_HUE_CLASSES.length]
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
        <h2 className="pp-display text-lg">
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

      <div className="pp-label grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
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
            'flex min-h-16 flex-col items-start gap-1 rounded-md border border-pp-grid-line p-1.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-32',
            inMonth ? 'text-foreground' : 'text-muted-foreground/50',
            hasContent ? 'hover:bg-accent/50' : 'cursor-default',
          )

          const buttonContent = (
            <>
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full text-xs font-medium',
                  isToday && 'pp-today bg-pp-today text-pp-today-foreground',
                )}
              >
                {date.getDate()}
              </span>
              {day && (
                <>
                  {/* Phone (below md): PP.5.3 shape markers only — detail lives in the popover. */}
                  <div className="flex flex-wrap items-center gap-1 md:hidden">
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

                  {/* Desktop/tablet (md+): bill names + payday check identifiers inline. */}
                  <div className="hidden w-full flex-col gap-0.5 md:flex">
                    {day.paydays.map((p, i) => {
                      const check = checkForPayday(p)
                      const label = check?.label ?? p.sourceName
                      const text = `${label} · ${formatShortDate(p.date)} · ${formatAmount(p.amount, 'fixed')}`
                      return (
                        <div
                          key={`p-${i}`}
                          title={text}
                          className={cn(
                            'pp-chip pp-label truncate rounded-sm border-l-2 bg-primary/10 px-1 py-0.5 text-[10px] font-medium leading-tight',
                            hueClassFor(check),
                            !p.real && 'opacity-40',
                          )}
                        >
                          {text}
                        </div>
                      )
                    })}
                    {day.bills.slice(0, 2).map((b, i) => {
                      const check = checkForBill(b)
                      return (
                        <div
                          key={`b-${i}`}
                          title={b.billName}
                          className={cn(
                            'pp-chip truncate rounded-sm border-l-2 bg-accent/40 px-1 py-0.5 text-[10px] leading-tight',
                            hueClassFor(check),
                            !b.real && 'opacity-40',
                            b.status === 'paid' && 'text-muted-foreground line-through',
                          )}
                        >
                          {b.billName}
                        </div>
                      )
                    })}
                    {day.bills.length > 2 && (
                      <span className="px-1 text-[10px] leading-tight font-medium text-muted-foreground">
                        +{day.bills.length - 2} more
                      </span>
                    )}
                  </div>
                </>
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
                        <span className="pp-label text-xs font-medium text-muted-foreground">Paydays</span>
                        {day.paydays.map((p, i) => {
                          const check = checkForPayday(p)
                          return (
                            <div key={i} className="flex items-center justify-between gap-2 text-sm">
                              <span className={cn(!p.real && 'text-muted-foreground')}>
                                {check ? `${check.label} · ${p.sourceName}` : p.sourceName}
                                {!p.real && ' · projected'}
                              </span>
                              <span className="pp-money">{formatAmount(p.amount, 'fixed')}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {day.bills.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="pp-label text-xs font-medium text-muted-foreground">Bills</span>
                        {day.bills.map((b, i) => {
                          const check = checkForBill(b)
                          return (
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
                                <span className="pp-money">{formatAmount(b.amount, b.amountType)}</span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {b.dueRuleLabel}
                                {!b.real && ' · projected'}
                                {b.real && b.status === 'paid' && ' · Paid'}
                              </span>
                              {b.real && b.paycheckId && (
                                <span className="text-xs text-muted-foreground">
                                  {check
                                    ? `Comes out of ${check.label} · ${formatShortDate(check.date)}`
                                    : `Comes out of ${paycheckLabel(b.paycheckId)}`}
                                </span>
                              )}
                            </div>
                          )
                        })}
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
