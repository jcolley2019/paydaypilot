import type { Bill, BillCategory, CspBucket } from '@/types/bills'
import { guessBillDefaults } from '@/lib/billGuess'
import { CATEGORY_LABELS, CSP_BUCKET_LABELS } from '@/lib/billLabels'

export interface GuessFields {
  category: BillCategory
  cspBucket: CspBucket
}

/** Which fields the user picked by hand; a picked field is never guessed over again. */
export interface GuessTouched {
  category: boolean
  cspBucket: boolean
}

export const UNTOUCHED: GuessTouched = { category: false, cspBucket: false }
/** Editing a saved bill: its stored values stand, so nothing is guessed. */
export const ALL_TOUCHED: GuessTouched = { category: true, cspBucket: true }

const DEFAULT_CATEGORY: BillCategory = 'other'
const DEFAULT_BUCKET: CspBucket = 'fixed'

/** Fills each untouched field from the name's guess; touched fields keep the user's pick. */
export function applyNameGuess(name: string, current: GuessFields, touched: GuessTouched): GuessFields {
  if (touched.category && touched.cspBucket) return current
  const guess = guessBillDefaults(name)
  return {
    category: touched.category ? current.category : guess.category,
    cspBucket: touched.cspBucket ? current.cspBucket : guess.csp_bucket,
  }
}

/**
 * One line naming what was filled in for the user, or null when nothing beyond the blank
 * defaults was guessed. Only untouched fields count — a manual pick isn't a guess.
 */
export function guessHint(current: GuessFields, touched: GuessTouched): string | null {
  const parts: string[] = []
  if (!touched.category && current.category !== DEFAULT_CATEGORY) {
    parts.push(`Category: ${CATEGORY_LABELS[current.category]}`)
  }
  if (!touched.cspBucket && current.cspBucket !== DEFAULT_BUCKET) {
    parts.push(`CSP bucket: ${CSP_BUCKET_LABELS[current.cspBucket]}`)
  }
  if (parts.length === 0) return null
  return `${parts.join(' · ')} — change under More options`
}

/** True when a saved bill has anything set under More options, so edit opens it expanded. */
export function hasMoreOptionsValues(bill: Bill): boolean {
  const guess = guessBillDefaults(bill.name)
  return (
    bill.is_debt ||
    Boolean(bill.notes?.trim()) ||
    Boolean(bill.payment_method?.trim()) ||
    bill.amount_type === 'estimate' ||
    bill.autopay ||
    bill.category !== guess.category ||
    bill.csp_bucket !== guess.csp_bucket
  )
}
