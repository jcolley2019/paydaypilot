export type BillCategory =
  | 'housing'
  | 'utilities'
  | 'insurance'
  | 'transportation'
  | 'subscriptions'
  | 'debt'
  | 'food'
  | 'health'
  | 'family'
  | 'other'

export const BILL_CATEGORIES: BillCategory[] = [
  'housing',
  'utilities',
  'insurance',
  'transportation',
  'subscriptions',
  'debt',
  'food',
  'health',
  'family',
  'other',
]

export type AmountType = 'fixed' | 'estimate'

export type CspBucket = 'fixed' | 'investment' | 'savings' | 'guilt_free'

export const CSP_BUCKETS: CspBucket[] = ['fixed', 'investment', 'savings', 'guilt_free']

export type AccountType = 'card' | 'loan'

export const ACCOUNT_TYPES: AccountType[] = ['card', 'loan']

export type DueRule =
  | { type: 'monthly_day'; day: number }
  | { type: 'last_day' }
  | { type: 'interval_weeks'; weeks: number; anchor: string }
  | { type: 'one_off'; date: string }

export interface Bill {
  id: string
  user_id: string
  name: string
  category: BillCategory
  amount: number
  amount_type: AmountType
  due_rule: DueRule
  autopay: boolean
  payment_method: string | null
  is_debt: boolean
  debt_balance: number | null
  debt_apr: number | null
  debt_min_payment: number | null
  account_type: AccountType | null
  credit_limit: number | null
  csp_bucket: CspBucket
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export type BillInsert = Omit<Bill, 'id' | 'user_id' | 'created_at' | 'updated_at'>

export type BillUpdate = Partial<BillInsert>
