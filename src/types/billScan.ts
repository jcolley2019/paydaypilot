import type { AccountType, AmountType, BillCategory, DueRule } from '@/types/bills'

export type ScanMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf'

export const SCAN_MIME_TYPES: ScanMime[] = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']

/** One candidate recurring bill, as returned by the extract-bills Edge Function. */
export interface BillCandidate {
  name: string
  amount: number
  amount_type: AmountType
  category: BillCategory
  due_rule: DueRule
  autopay: boolean | null
  is_debt: boolean
  account_type: AccountType | null
  debt_balance: number | null
  debt_apr: number | null
  debt_min_payment: number | null
  credit_limit: number | null
  min_payment_percent: number | null
  min_payment_floor: number | null
  confidence: number
  evidence: string
  source_file: string
  possible_duplicate_of: string | null
}

export interface ScanFile {
  name: string
  mime: ScanMime
  /** Base64 file contents, without the data: URL prefix */
  data: string
}

export interface ScanRequest {
  files: ScanFile[]
  existing: { name: string; amount: number }[]
}

export interface ScanResponse {
  candidates: BillCandidate[]
}
