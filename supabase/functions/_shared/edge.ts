// PP.9.1 — shared Edge Function plumbing for the Plaid functions (Deno only).
// Same auth pattern as extract-bills: CORS + OPTIONS, the caller's JWT checked with
// getUser on the anon client, then an email allowlist (ALLOWED_PLAID_EMAILS). Only after
// both pass is a service-role client created; every query made with it must be scoped
// to the verified user id.
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'
import { PlaidApiError, plaidConfigFrom, type PlaidConfig } from './plaidApi.ts'

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export interface PlaidContext {
  user: User
  admin: SupabaseClient
  plaid: PlaidConfig
  tokenKey: string
  body: Record<string, unknown>
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function authenticate(req: Request): Promise<PlaidContext> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = /^Bearer\s+(\S+)$/i.exec(authHeader)?.[1]
  if (!jwt) throw new HttpError(401, 'Missing bearer token')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) throw new HttpError(500, 'SUPABASE_URL / SUPABASE_ANON_KEY not set')
  const anon = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const {
    data: { user },
  } = await anon.auth.getUser(jwt)
  if (!user) throw new HttpError(401, 'Not signed in')

  // Signups are open, so only allowlisted accounts may spend Plaid connections. Fails closed.
  const allowed = (Deno.env.get('ALLOWED_PLAID_EMAILS') ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  const email = user.email?.trim().toLowerCase()
  if (!email || !allowed.includes(email)) throw new HttpError(403, "Bank connections aren't enabled for this account")

  const plaid = plaidConfigFrom((name) => Deno.env.get(name))
  if (typeof plaid === 'string') throw new HttpError(500, plaid)
  const tokenKey = Deno.env.get('PLAID_TOKEN_KEY')
  if (!tokenKey) throw new HttpError(500, 'PLAID_TOKEN_KEY not set')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceKey) throw new HttpError(500, 'SUPABASE_SERVICE_ROLE_KEY not set')

  let body: Record<string, unknown> = {}
  const raw = await req.text()
  if (raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
      body = parsed as Record<string, unknown>
    } catch {
      throw new HttpError(400, 'Body must be a JSON object')
    }
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return { user, admin, plaid, tokenKey, body }
}

/** Wraps a Plaid function: OPTIONS, POST-only, auth + allowlist, uniform JSON errors. */
export function servePlaid(name: string, handler: (ctx: PlaidContext) => Promise<Response>): void {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'Use POST')
      return await handler(await authenticate(req))
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status >= 500) console.error(`${name} ${err.status}: ${err.message}`)
        return json({ error: err.message }, err.status)
      }
      if (err instanceof PlaidApiError) {
        console.error(`${name} Plaid error: ${err.message} (request ${err.requestId ?? 'n/a'})`)
        return json({ error: 'plaid_error', code: err.errorCode ?? `HTTP_${err.status}` }, 502)
      }
      // Messages here come from Plaid error bodies or Postgres — never tokens or keys.
      console.error(`${name} unexpected error: ${err instanceof Error ? err.message : String(err)}`)
      return json({ error: 'Unexpected error' }, 500)
    }
  })
}

export { HttpError }
