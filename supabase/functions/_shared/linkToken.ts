// PP.9.3 — the /link/token/create request body, shared by the plaid-link-token Edge
// Function and scripts/plaid-smoke.ts so both send exactly the same shape. Pure: no Deno
// or npm imports.

/**
 * The redirect_uri to send, or null. Only a request coming from the redirect URI's own
 * origin (the deployed app) gets one; localhost dev and any other origin get none, and
 * bank sign-in then stays in Plaid's pop-up.
 */
export function linkTokenRedirectUri(origin: string | null, configured: string | undefined): string | null {
  const uri = configured?.trim()
  if (!origin || !uri) return null
  let allowedOrigin: string
  try {
    allowedOrigin = new URL(uri).origin
  } catch {
    return null
  }
  return origin === allowedOrigin ? uri : null
}

export interface LinkTokenRequestOptions {
  userId: string
  /** Set for update mode (re-login to an existing bank); products are then omitted. */
  accessToken?: string
  redirectUri?: string | null
}

export function buildLinkTokenRequest({ userId, accessToken, redirectUri }: LinkTokenRequestOptions): Record<string, unknown> {
  const request: Record<string, unknown> = {
    client_name: 'PaydayPilot',
    language: 'en',
    country_codes: ['US'],
    user: { client_user_id: userId },
  }
  if (accessToken) {
    request.access_token = accessToken
  } else {
    request.products = ['transactions']
    request.transactions = { days_requested: 180 }
  }
  if (redirectUri) request.redirect_uri = redirectUri
  return request
}
