import { cn } from '@/lib/utils'

export type CalendarMarkerKind = 'payday' | 'bill-due' | 'bill-paid'

interface CalendarMarkerProps {
  kind: CalendarMarkerKind
  /** 'ghost' renders the reduced-opacity weight used for projected (non-real) entries. */
  weight?: 'solid' | 'ghost'
  /** 'sm' for the Month grid, 'xs' for the Year mini-months. */
  size?: 'sm' | 'xs'
}

const SIZE_CLASSES: Record<'sm' | 'xs', string> = {
  sm: 'size-1.5',
  xs: 'size-1',
}

/** Theme tokens: default resolves to the shipped emerald/sky, bright variants supply muted-warm hues. */
const COLOR_CLASSES: Record<CalendarMarkerKind, string> = {
  payday: 'bg-pp-payday',
  'bill-due': 'bg-pp-bill',
  'bill-paid': 'bg-muted-foreground',
}

/** Paydays render as a dot, bills as a diamond, so type reads without relying on color. */
export function CalendarMarker({ kind, weight = 'solid', size = 'sm' }: CalendarMarkerProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        SIZE_CLASSES[size],
        COLOR_CLASSES[kind],
        kind === 'payday' ? 'rounded-full' : 'rotate-45 rounded-[1px]',
        weight === 'ghost' && 'opacity-40',
      )}
    />
  )
}
