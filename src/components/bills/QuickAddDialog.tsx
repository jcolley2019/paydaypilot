import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DayOfMonthPicker } from '@/components/bills/DayOfMonthPicker'
import {
  emptyRow,
  isEmptyRow,
  missingFields,
  rowCategory,
  rowToInsert,
  type QuickAddField,
  type QuickAddRow,
} from '@/components/bills/quickAddRows'
import { CATEGORY_LABELS } from '@/lib/billLabels'
import { cn } from '@/lib/utils'
import { BILL_CATEGORIES } from '@/types/bills'
import type { BillCategory, BillInsert } from '@/types/bills'

const STARTING_ROWS = 3

function startingRows(): QuickAddRow[] {
  return Array.from({ length: STARTING_ROWS }, emptyRow)
}

function money(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

interface QuickAddDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Saves the bills; true when they were added. */
  onAddBills: (bills: BillInsert[]) => Promise<boolean>
}

export function QuickAddDialog({ open, onOpenChange, onAddBills }: QuickAddDialogProps) {
  const uid = useId()
  const [rows, setRows] = useState<QuickAddRow[]>(startingRows)
  const [adding, setAdding] = useState(false)
  // Unfinished rows are only called out once the user has tried to save them.
  const [showIssues, setShowIssues] = useState(false)
  // The field to focus once the rows it belongs to have rendered.
  const pendingFocus = useRef<string | null>(null)

  useEffect(() => {
    if (!pendingFocus.current) return
    document.getElementById(pendingFocus.current)?.focus()
    pendingFocus.current = null
  }, [rows])

  const started = rows.filter((row) => !isEmptyRow(row))
  const bills = started.map(rowToInsert).filter((bill): bill is BillInsert => bill !== null)
  const unfinished = started.length - bills.length
  const total = bills.reduce((sum, bill) => sum + bill.amount, 0)

  function fieldId(rowId: string, field: QuickAddField): string {
    return `${uid}-${rowId}-${field}`
  }

  function reset() {
    setRows(startingRows())
    setShowIssues(false)
    setAdding(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next && adding) return
    if (!next) reset()
    onOpenChange(next)
  }

  function updateRow(id: string, changes: Partial<QuickAddRow>) {
    setRows((list) => list.map((row) => (row.id === id ? { ...row, ...changes } : row)))
  }

  function addRow() {
    const row = emptyRow()
    pendingFocus.current = fieldId(row.id, 'name')
    setRows((list) => [...list, row])
  }

  function removeRow(id: string) {
    // The grid never drops below one row; removing the last one just clears it.
    setRows((list) => (list.length === 1 ? [emptyRow()] : list.filter((row) => row.id !== id)))
  }

  /** Enter moves down a row like a spreadsheet, adding one at the bottom. */
  function handleEnter(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    const next = rows[index + 1]
    if (next) document.getElementById(fieldId(next.id, 'name'))?.focus()
    else addRow()
  }

  async function addBills() {
    if (adding || started.length === 0) return
    const firstUnfinished = started.find((row) => missingFields(row).length > 0)
    if (firstUnfinished) {
      setShowIssues(true)
      document.getElementById(fieldId(firstUnfinished.id, missingFields(firstUnfinished)[0]))?.focus()
      return
    }
    setAdding(true)
    const saved = await onAddBills(bills)
    setAdding(false)
    if (saved) handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        // A stray Escape shouldn't throw away a grid of typed bills; Cancel and the X still close.
        onEscapeKeyDown={(event) => {
          if (started.length > 0) event.preventDefault()
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById(fieldId(rows[0].id, 'name'))?.focus()
        }}
        className="top-0 left-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[min(90dvh,48rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl md:max-w-2xl"
      >
        <DialogHeader className="border-b border-border px-4 pt-[max(1rem,env(safe-area-inset-top))] pr-12 pb-3 sm:pt-4">
          <DialogTitle className="pp-display text-lg">Quick add</DialogTitle>
          <DialogDescription>
            One monthly bill per row. We guess the category from the name — tap it to change it.
          </DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={adding}
            className="absolute top-[max(0.5rem,env(safe-area-inset-top))] right-2 sm:top-2"
          >
            <X />
            <span className="sr-only">Close</span>
          </Button>
        </DialogClose>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 dark:scheme-dark">
          <div
            aria-hidden
            className="pp-label mb-2 hidden grid-cols-[minmax(0,1fr)_7rem_8.5rem_8.5rem_1.75rem] gap-2 text-xs text-muted-foreground md:grid"
          >
            <span>Bill</span>
            <span>Amount</span>
            <span>Due day</span>
            <span>Category</span>
          </div>

          <ul className="flex flex-col gap-4 md:gap-2">
            {rows.map((row, index) => {
              const missing = showIssues ? missingFields(row) : []
              const category = rowCategory(row)
              const label = row.name.trim() || `row ${index + 1}`
              return (
                <li
                  key={row.id}
                  className="grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-2 md:grid-cols-[minmax(0,1fr)_7rem_8.5rem_8.5rem_1.75rem]"
                >
                  <Input
                    id={fieldId(row.id, 'name')}
                    aria-label={`Bill name, row ${index + 1}`}
                    aria-invalid={missing.includes('name') ? true : undefined}
                    placeholder="Bill name"
                    autoComplete="off"
                    enterKeyHint="next"
                    value={row.name}
                    onChange={(event) => updateRow(row.id, { name: event.target.value })}
                    onKeyDown={(event) => handleEnter(event, index)}
                  />
                  <Input
                    id={fieldId(row.id, 'amount')}
                    aria-label={`Amount for ${label}`}
                    aria-invalid={missing.includes('amount') ? true : undefined}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    enterKeyHint="next"
                    className="pp-money text-right"
                    value={row.amount}
                    onChange={(event) => updateRow(row.id, { amount: event.target.value })}
                    onKeyDown={(event) => handleEnter(event, index)}
                  />
                  <div className="col-span-2 flex min-w-0 items-center gap-2 md:contents">
                    <DayOfMonthPicker
                      id={fieldId(row.id, 'day')}
                      value={row.day}
                      onChange={(day) => updateRow(row.id, { day })}
                      className={cn(
                        'w-34 shrink-0 md:w-full',
                        missing.includes('day') && 'border-destructive ring-3 ring-destructive/20',
                      )}
                    />
                    <Select
                      value={category}
                      onValueChange={(value) => updateRow(row.id, { category: value as BillCategory })}
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={`Category for ${label}`}
                        className={cn(
                          'min-w-0 gap-1 py-0 pr-1.5 pl-2.5 text-xs data-[size=sm]:h-6 data-[size=sm]:rounded-full md:justify-self-start',
                          category === 'other' && row.category === null && 'text-muted-foreground',
                        )}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BILL_CATEGORIES.map((option) => (
                          <SelectItem key={option} value={option}>
                            {CATEGORY_LABELS[option]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="ml-auto shrink-0 text-muted-foreground md:ml-0"
                      onClick={() => removeRow(row.id)}
                    >
                      <Trash2 />
                      <span className="sr-only">Remove {label}</span>
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>

          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={addRow}>
            <Plus />
            Add row
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/50 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3">
          <p className="mr-auto text-sm" aria-live="polite">
            {showIssues && unfinished > 0 ? (
              <span className="text-destructive">Finish the highlighted fields</span>
            ) : bills.length === 0 ? (
              <span className="text-muted-foreground">Enter adds a row</span>
            ) : (
              <>
                {bills.length} {bills.length === 1 ? 'bill' : 'bills'}
                <span className="text-muted-foreground"> · </span>
                <span className="pp-money">{money(total)}</span>
                <span className="text-muted-foreground"> a month</span>
              </>
            )}
          </p>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={adding}>
            Cancel
          </Button>
          <Button type="button" onClick={addBills} disabled={started.length === 0 || adding}>
            {adding
              ? 'Adding…'
              : bills.length === 0
                ? 'Add bills'
                : `Add ${bills.length} ${bills.length === 1 ? 'bill' : 'bills'}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
