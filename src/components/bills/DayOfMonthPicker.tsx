import { useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type DayOfMonthValue = number | 'last'

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

function labelFor(value: DayOfMonthValue | null): string {
  if (value == null) return 'Select a day'
  if (value === 'last') return 'Last day of month'
  return ordinal(value)
}

interface DayOfMonthPickerProps {
  id?: string
  value: DayOfMonthValue | null
  onChange: (value: DayOfMonthValue) => void
  disabled?: boolean
  className?: string
}

export function DayOfMonthPicker({ id, value, onChange, disabled, className }: DayOfMonthPickerProps) {
  const [open, setOpen] = useState(false)
  const dayRefs = useRef<Array<HTMLButtonElement | null>>([])

  function selectDay(day: number) {
    onChange(day)
    setOpen(false)
  }

  function selectLastDay() {
    onChange('last')
    setOpen(false)
  }

  function handleGridKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = DAYS.findIndex((d) => dayRefs.current[d - 1] === document.activeElement)
    if (currentIndex === -1) return

    let nextIndex = currentIndex
    switch (e.key) {
      case 'ArrowRight':
        nextIndex = Math.min(currentIndex + 1, DAYS.length - 1)
        break
      case 'ArrowLeft':
        nextIndex = Math.max(currentIndex - 1, 0)
        break
      case 'ArrowDown':
        nextIndex = Math.min(currentIndex + 7, DAYS.length - 1)
        break
      case 'ArrowUp':
        nextIndex = Math.max(currentIndex - 7, 0)
        break
      default:
        return
    }
    e.preventDefault()
    dayRefs.current[nextIndex]?.focus()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-8 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1 text-left text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30',
            value == null && 'text-muted-foreground',
            className
          )}
        >
          {labelFor(value)}
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div
          role="grid"
          aria-label="Day of month"
          className="grid grid-cols-7 gap-1"
          onKeyDown={handleGridKeyDown}
        >
          {DAYS.map((day) => {
            const selected = value === day
            const tabbable = selected || (value == null && day === 1)
            return (
              <button
                key={day}
                ref={(el) => {
                  dayRefs.current[day - 1] = el
                }}
                type="button"
                role="gridcell"
                aria-selected={selected}
                tabIndex={tabbable ? 0 : -1}
                onClick={() => selectDay(day)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                  selected
                    ? 'bg-primary text-primary-foreground hover:bg-primary/80'
                    : 'text-foreground'
                )}
              >
                {day}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          aria-selected={value === 'last'}
          onClick={selectLastDay}
          className={cn(
            'mt-2 flex h-8 w-full items-center justify-center rounded-md text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
            value === 'last'
              ? 'bg-primary text-primary-foreground hover:bg-primary/80'
              : 'text-foreground'
          )}
        >
          Last day of month
        </button>
      </PopoverContent>
    </Popover>
  )
}
