// PP.9.1 — Plaid transaction sync.
// POST {} -> syncs every active item of the caller, one after another; an item that fails
// (e.g. ITEM_LOGIN_REQUIRED -> status 'login_required') does not stop the others.
// POST { item_id } -> syncs just that item of the caller's, whatever its status other than
// 'removed' — the way back to 'active' after the user re-logs in through update mode.
// -> { items: [{ id, institution_name, status, accounts, transactions_upserted,
//                transactions_removed, error_code? }] }
// Auth: caller's Supabase JWT + ALLOWED_PLAID_EMAILS (see _shared/edge.ts).
import { HttpError, json, servePlaid } from '../_shared/edge.ts'
import { syncItem, type ItemRef, type ItemSyncResult } from '../_shared/itemSync.ts'

servePlaid('plaid-sync', async ({ user, admin, plaid, tokenKey, body }) => {
  let query = admin.from('plaid_items').select('id, institution_name').eq('user_id', user.id)
  if (body.item_id !== undefined) {
    if (typeof body.item_id !== 'string' || !body.item_id) throw new HttpError(400, 'item_id must be a string')
    query = query.eq('id', body.item_id).neq('status', 'removed')
  } else {
    query = query.eq('status', 'active')
  }
  const { data, error } = await query.order('created_at')
  if (error) throw new Error(`read plaid items: ${error.message}`)
  const items = (data ?? []) as ItemRef[]
  if (body.item_id !== undefined && items.length === 0) throw new HttpError(404, 'Bank connection not found')

  const results: ItemSyncResult[] = []
  for (const item of items) results.push(await syncItem(admin, plaid, user.id, item, tokenKey))
  return json({ items: results })
})
