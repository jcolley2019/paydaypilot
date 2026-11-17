// PP.9.2 — client-side shapes of the Plaid tables (read-only for the browser; the Edge
// Functions in supabase/functions/plaid-* do every write).

export type PlaidItemStatus = 'active' | 'login_required' | 'error' | 'removed'

export interface PlaidItem {
  id: string
  institution_name: string | null
  status: PlaidItemStatus
  error_code: string | null
  last_synced_at: string | null
  created_at: string
}

export interface PlaidAccountRow {
  id: string
  name: string
  mask: string | null
  type: string
  subtype: string | null
  plaid_item_id: string | null
  balance: number | null
  available_balance: number | null
}

/** One item's outcome from plaid-sync. */
export interface PlaidSyncItemResult {
  id: string
  institution_name: string | null
  status: 'active' | 'login_required' | 'error'
  accounts: number
  transactions_upserted: number
  transactions_removed: number
  error_code?: string
}

export interface PlaidSyncResponse {
  items: PlaidSyncItemResult[]
}

export interface PlaidExchangeResponse {
  item: { id: string; institution_name: string | null }
  accounts: number
  transactions: number
}
