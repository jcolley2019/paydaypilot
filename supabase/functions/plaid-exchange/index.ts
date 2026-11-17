// PP.9.1 — Plaid public token exchange.
// POST { public_token } -> exchange it, look up the institution (/item/get), refuse a second
// active connection to the same institution (409 already_connected, after /item/remove on
// the new item), else store the item + its encrypted access token and run the first sync.
// -> { item: { id, institution_name }, accounts: n, transactions: n }
// Auth: caller's Supabase JWT + ALLOWED_PLAID_EMAILS (see _shared/edge.ts).
import { HttpError, json, servePlaid } from '../_shared/edge.ts'
import { syncItem } from '../_shared/itemSync.ts'
import { plaidRequest, type PlaidConfig } from '../_shared/plaidApi.ts'
import { encryptToken } from '../_shared/tokenCrypto.ts'

interface ItemGetResponse {
  item: { item_id: string; institution_id?: string | null; institution_name?: string | null }
}

/** Best effort: a failure here is logged (without the token) and otherwise ignored. */
async function removePlaidItem(plaid: PlaidConfig, accessToken: string): Promise<void> {
  try {
    await plaidRequest(plaid, '/item/remove', { access_token: accessToken })
  } catch (err) {
    console.error(`plaid-exchange: /item/remove failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

servePlaid('plaid-exchange', async ({ user, admin, plaid, tokenKey, body }) => {
  const publicToken = body.public_token
  if (typeof publicToken !== 'string' || !publicToken.trim()) throw new HttpError(400, 'public_token is required')

  const exchanged = await plaidRequest<{ access_token: string; item_id: string }>(plaid, '/item/public_token/exchange', {
    public_token: publicToken.trim(),
  })
  const accessToken = exchanged.access_token

  // From here a new Plaid item exists; any failure before it is stored removes it again.
  let handled = false
  try {
    const { item } = await plaidRequest<ItemGetResponse>(plaid, '/item/get', { access_token: accessToken })
    const institutionId = item.institution_id ?? null
    const institutionName = item.institution_name ?? null

    if (institutionId) {
      const { data: existing, error } = await admin
        .from('plaid_items')
        .select('id')
        .eq('user_id', user.id)
        .eq('institution_id', institutionId)
        .eq('status', 'active')
        .limit(1)
      if (error) throw new Error(`check existing items: ${error.message}`)
      if (existing && existing.length > 0) {
        await removePlaidItem(plaid, accessToken)
        handled = true // already removed — skip the cleanup below
        return json({ error: 'already_connected' }, 409)
      }
    }

    const encrypted = await encryptToken(accessToken, tokenKey)
    const { data: inserted, error: insertError } = await admin
      .from('plaid_items')
      .insert({
        user_id: user.id,
        item_id: exchanged.item_id,
        institution_id: institutionId,
        institution_name: institutionName,
        status: 'active',
      })
      .select('id')
      .single()
    if (insertError) {
      if (insertError.code === '23505') {
        // This Plaid item is already stored; removing it would break the existing connection.
        handled = true
        return json({ error: 'already_connected' }, 409)
      }
      throw new Error(`insert plaid item: ${insertError.message}`)
    }
    const plaidItemId = inserted.id as string

    const { error: secretError } = await admin.from('plaid_item_secrets').insert({
      plaid_item_id: plaidItemId,
      access_token_encrypted: encrypted,
      transactions_cursor: null,
    })
    if (secretError) {
      await admin.from('plaid_items').delete().eq('id', plaidItemId).eq('user_id', user.id)
      throw new Error(`insert item secret: ${secretError.message}`)
    }
    handled = true

    const result = await syncItem(admin, plaid, user.id, { id: plaidItemId, institution_name: institutionName }, tokenKey)
    return json({
      item: { id: plaidItemId, institution_name: institutionName },
      accounts: result.accounts,
      transactions: result.transactions_upserted,
    })
  } finally {
    if (!handled) await removePlaidItem(plaid, accessToken)
  }
})
