// PP.9.1 — Plaid Link token.
// POST {} -> { link_token } for a new connection (transactions, US, 180 days of history).
// POST { item_id } (our plaid_items.id, must be the caller's) -> an update-mode link token
// for re-login; products are omitted in update mode, as Plaid requires.
// Auth: caller's Supabase JWT + ALLOWED_PLAID_EMAILS (see _shared/edge.ts).
import { HttpError, json, servePlaid } from '../_shared/edge.ts'
import { loadItemSecret } from '../_shared/itemSync.ts'
import { plaidRequest } from '../_shared/plaidApi.ts'

servePlaid('plaid-link-token', async ({ user, admin, plaid, tokenKey, body }) => {
  const request: Record<string, unknown> = {
    client_name: 'PaydayPilot',
    language: 'en',
    country_codes: ['US'],
    user: { client_user_id: user.id },
  }

  if (body.item_id !== undefined) {
    if (typeof body.item_id !== 'string' || !body.item_id) throw new HttpError(400, 'item_id must be a string')
    const { data: item, error } = await admin
      .from('plaid_items')
      .select('id')
      .eq('id', body.item_id)
      .eq('user_id', user.id)
      .neq('status', 'removed')
      .maybeSingle()
    if (error) throw new Error(`read plaid item: ${error.message}`)
    if (!item) throw new HttpError(404, 'Bank connection not found')
    const { accessToken } = await loadItemSecret(admin, item.id as string, tokenKey)
    request.access_token = accessToken
  } else {
    request.products = ['transactions']
    request.transactions = { days_requested: 180 }
  }

  const { link_token } = await plaidRequest<{ link_token: string }>(plaid, '/link/token/create', request)
  return json({ link_token })
})
