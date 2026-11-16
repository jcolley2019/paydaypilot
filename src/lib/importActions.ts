import type { AmountType, Bill, BillUpdate } from '@/types/bills'

/** What confirming the import does with one candidate. */
export type ImportAction = 'add' | 'update' | 'skip'

/** The existing bill a candidate matched, as much of it as the review needs. */
export interface BillMatch {
  id: string
  name: string
  amount: number
}

/** Same amount to the cent; statements and stored bills can differ in float noise. */
export function sameAmount(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100)
}

/** The existing bill a candidate's possible_duplicate_of names (case-insensitive), if it's still there. */
export function findMatch(duplicateOf: string | null, bills: Pick<Bill, 'id' | 'name' | 'amount'>[]): BillMatch | null {
  const key = duplicateOf?.trim().toLowerCase()
  if (!key) return null
  const bill = bills.find((entry) => entry.name.trim().toLowerCase() === key)
  return bill ? { id: bill.id, name: bill.name, amount: Number(bill.amount) } : null
}

/**
 * The action for a candidate. Unmatched → add. Matched → update when the extracted amount
 * differs from the bill's, skip when it's the same. A user choice wins, except that there's
 * nothing to update without a match, so that falls back to add.
 */
export function chooseAction(
  extractedAmount: number,
  match: BillMatch | null,
  override: ImportAction | null = null,
): ImportAction {
  if (override) return override === 'update' && !match ? 'add' : override
  if (!match) return 'add'
  return sameAmount(extractedAmount, match.amount) ? 'skip' : 'update'
}

/**
 * An update touches only the amount; the bill keeps its own name, due rule, and category.
 * A candidate that says the amount varies also marks the bill as an estimate.
 */
export function amountUpdate(amount: number, candidateAmountType: AmountType): BillUpdate {
  return candidateAmountType === 'estimate' ? { amount, amount_type: 'estimate' } : { amount }
}

/** "Add 3 · Update 2" for the confirm button; null when nothing would change. */
export function batchLabel(adds: number, updates: number): string | null {
  const parts = [adds > 0 && `Add ${adds}`, updates > 0 && `Update ${updates}`].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** "3 added, 2 updated" for the success toast. */
export function batchSummary(adds: number, updates: number): string {
  return [adds > 0 && `${adds} added`, updates > 0 && `${updates} updated`].filter(Boolean).join(', ')
}
