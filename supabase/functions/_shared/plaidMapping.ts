// PP.9.1 — Plaid account / transaction -> database row mapping.
// Pure TypeScript (no Deno or npm imports) so vitest and Node scripts can import it.
//
// The rows deliberately leave out accounts.active and transactions.matched_bill_instance_id
// (and id / created_at): an upsert only writes the columns it is given, so those stay as
// the app set them.

/** The parts of a Plaid account object this app stores. */
export interface PlaidAccount {
  account_id: string
  name: string
  official_name?: string | null
  mask?: string | null
  type: string
  subtype?: string | null
  balances: {
    current?: number | null
    available?: number | null
  }
}

/** The parts of a Plaid transaction object (from /transactions/sync) this app stores. */
export interface PlaidTransaction {
  transaction_id: string
  account_id: string
  amount: number
  date: string
  authorized_date?: string | null
  name?: string | null
  merchant_name?: string | null
  original_description?: string | null
  pending: boolean
  pending_transaction_id?: string | null
  personal_finance_category?: { primary?: string | null; detailed?: string | null } | null
}

export interface PlaidRemovedTransaction {
  transaction_id: string
  account_id?: string
}

export interface AccountRow {
  user_id: string
  name: string
  mask: string | null
  type: string
  subtype: string | null
  source: 'plaid'
  plaid_item_id: string
  plaid_account_id: string
  balance: number | null
  available_balance: number | null
  balance_updated_at: string
}

export interface TransactionRow {
  user_id: string
  account_id: string
  source: 'plaid'
  plaid_transaction_id: string
  pending_transaction_id: string | null
  /** Plaid's sign, unchanged: positive = money out of the account, negative = money in. */
  amount: number
  date: string
  authorized_date: string | null
  name: string
  merchant: string | null
  category: string | null
  category_detail: string | null
  pending: boolean
  updated_at: string
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed ? trimmed : null
}

/** plaidItemId is our plaid_items.id (uuid), not Plaid's item_id. */
export function mapAccount(account: PlaidAccount, userId: string, plaidItemId: string, nowIso: string): AccountRow {
  return {
    user_id: userId,
    name: textOrNull(account.name) ?? textOrNull(account.official_name) ?? 'Account',
    mask: textOrNull(account.mask),
    type: account.type,
    subtype: textOrNull(account.subtype),
    source: 'plaid',
    plaid_item_id: plaidItemId,
    plaid_account_id: account.account_id,
    balance: finiteOrNull(account.balances?.current),
    available_balance: finiteOrNull(account.balances?.available),
    balance_updated_at: nowIso,
  }
}

/**
 * accountId is our accounts.id for the transaction's Plaid account_id. Returns null when the
 * transaction has no usable amount or date, so a malformed row never reaches the database.
 */
export function mapTransaction(
  tx: PlaidTransaction,
  userId: string,
  accountId: string,
  nowIso: string,
): TransactionRow | null {
  const amount = finiteOrNull(tx.amount)
  if (amount === null || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date ?? '')) return null
  const merchant = textOrNull(tx.merchant_name)
  return {
    user_id: userId,
    account_id: accountId,
    source: 'plaid',
    plaid_transaction_id: tx.transaction_id,
    pending_transaction_id: textOrNull(tx.pending_transaction_id),
    amount,
    date: tx.date,
    authorized_date: textOrNull(tx.authorized_date),
    name: textOrNull(tx.name) ?? merchant ?? textOrNull(tx.original_description) ?? 'Transaction',
    merchant,
    category: textOrNull(tx.personal_finance_category?.primary),
    category_detail: textOrNull(tx.personal_finance_category?.detailed),
    pending: tx.pending === true,
    updated_at: nowIso,
  }
}

/**
 * Folds every page of a sync into one set of writes: the latest version of each transaction
 * (modified after added, later pages after earlier ones), minus the removed ones. One upsert
 * batch can then never touch the same plaid_transaction_id twice.
 */
export function collapseSyncUpdates(
  added: PlaidTransaction[],
  modified: PlaidTransaction[],
  removed: PlaidRemovedTransaction[],
): { upserts: PlaidTransaction[]; removedIds: string[] } {
  const latest = new Map<string, PlaidTransaction>()
  for (const tx of [...added, ...modified]) latest.set(tx.transaction_id, tx)
  const removedIds = [...new Set(removed.map((tx) => tx.transaction_id))]
  for (const id of removedIds) latest.delete(id)
  return { upserts: [...latest.values()], removedIds }
}
