import { guessBillDefaults } from '@/lib/billGuess'
import type { DayOfMonthValue } from '@/components/bills/DayOfMonthPicker'
import type { BillCategory, BillInsert } from '@/types/bills'

/** One line of the quick-add grid, as typed. */
export interface QuickAddRow {
  id: string
  name: string
  amount: string
  day: DayOfMonthValue | null
  /** The category the user picked; null while the guess from the name stands. */
  category: BillCategory | null
}

export type QuickAddField = 'name' | 'amount' | 'day'

let rowSequence = 0

export function emptyRow(): QuickAddRow {
  rowSequence += 1
  return { id: `quick-${rowSequence}`, name: '', amount: '', day: null, category: null }
}

export function validAmount(text: string): number | null {
  const amount = Number(text)
  return text.trim() !== '' && Number.isFinite(amount) && amount > 0 ? amount : null
}

/** Untouched rows are skipped on save rather than flagged. */
export function isEmptyRow(row: QuickAddRow): boolean {
  return row.name.trim() === '' && row.amount.trim() === '' && row.day === null
}

/** What a started row still needs before it can be saved, in tab order. */
export function missingFields(row: QuickAddRow): QuickAddField[] {
  if (isEmptyRow(row)) return []
  const missing: QuickAddField[] = []
  if (row.name.trim() === '') missing.push('name')
  if (validAmount(row.amount) === null) missing.push('amount')
  if (row.day === null) missing.push('day')
  return missing
}

export function rowCategory(row: QuickAddRow): BillCategory {
  return row.category ?? guessBillDefaults(row.name).category
}

/** The bill a finished row describes; null for empty or unfinished rows. */
export function rowToInsert(row: QuickAddRow): BillInsert | null {
  const amount = validAmount(row.amount)
  const name = row.name.trim()
  if (!name || amount === null || row.day === null) return null
  return {
    name,
    category: rowCategory(row),
    amount,
    amount_type: 'fixed',
    due_rule: row.day === 'last' ? { type: 'last_day' } : { type: 'monthly_day', day: row.day },
    autopay: false,
    payment_method: null,
    is_debt: false,
    debt_balance: null,
    debt_apr: null,
    debt_min_payment: null,
    account_type: null,
    credit_limit: null,
    min_payment_percent: null,
    min_payment_floor: null,
    csp_bucket: guessBillDefaults(name).csp_bucket,
    active: true,
    notes: null,
  }
}
