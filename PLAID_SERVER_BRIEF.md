PP.9.1 — Plaid server side: link token, token exchange, transaction sync

Read CLAUDE.md first. Work directly on main in C:\dev\paydaypilot. No UI in
this brick: nothing under src/pages or src/components changes.

GOAL
Three Supabase Edge Functions that let a signed-in, allow-listed user connect
a bank through Plaid and pull accounts + transactions into the database.
Plaid access tokens never reach the browser and are stored encrypted.

BEFORE CODING
Do not write Plaid request shapes from memory. Read the current docs first
(markdown versions exist, e.g.
https://plaid.com/docs/api/products/transactions/index.html.md,
https://plaid.com/docs/api/link/index.html.md,
https://plaid.com/docs/sandbox/index.html.md). If Plaid docs/MCP tools are
connected in this session, use them.

SCHEMA (already live — do NOT write or run SQL)
- plaid_items(id, user_id, item_id unique, institution_id, institution_name,
  status 'active'|'login_required'|'error'|'removed', error_code,
  last_synced_at, created_at, updated_at) — client can only SELECT own rows.
- plaid_item_secrets(plaid_item_id pk/fk, access_token_encrypted,
  transactions_cursor, updated_at) — RLS on, no policies: service role only.
- accounts(id, user_id, name, mask, type, subtype, source 'manual'|'plaid',
  plaid_item_id fk, plaid_account_id unique, balance, available_balance,
  balance_updated_at, active, created_at)
- transactions(id, user_id, account_id fk, source, plaid_transaction_id
  unique, pending_transaction_id, amount, date, authorized_date, name,
  merchant, category, category_detail, pending, matched_bill_instance_id fk,
  created_at, updated_at). amount keeps Plaid's sign: positive = money out.

BUILD
Shared code in supabase/functions/_shared/. Keep the pure parts (Plaid
transaction/account -> row mapping, token encrypt/decrypt) in modules that
use only fetch + Web Crypto, with no Deno or npm: imports, so vitest and a
local Node script can import them.

1. plaid-link-token — POST {} -> { link_token }. products ['transactions'],
   country_codes ['US'], language 'en', client_name 'PaydayPilot',
   client_user_id = the verified user id, transactions.days_requested 180.
   Optional body { item_id } (our plaid_items.id, must belong to the caller)
   returns an update-mode link token for re-login instead.
2. plaid-exchange — POST { public_token }. Exchange it, look up the
   institution (/item/get), then: if the caller already has an active item
   for that institution_id, call /item/remove on the new one and return 409
   { error: 'already_connected' }. Otherwise insert plaid_items + the
   encrypted token, run the sync for that item, and return
   { item: { id, institution_name }, accounts: n, transactions: n }.
3. plaid-sync — POST {} -> syncs every active item of the caller and
   returns per-item counts and status.

Sync rules: loop /transactions/sync from the stored cursor until has_more
is false; on TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION restart from the
original cursor; save the new cursor only after every page is applied.
added + modified -> upsert on plaid_transaction_id; removed -> delete.
Accounts -> upsert on plaid_account_id with balances. Upserts must never
overwrite transactions.matched_bill_instance_id or accounts.active.
ITEM_LOGIN_REQUIRED -> set the item's status 'login_required' + error_code
and carry on with the caller's other items.

Auth, same pattern as extract-bills (CORS, OPTIONS, getUser(jwt) with the
anon client), then: caller's email must be in the ALLOWED_PLAID_EMAILS
secret (comma-separated) or 403 — open signup must not be able to spend
Plaid connections. Only after that, create a service-role client
(SUPABASE_SERVICE_ROLE_KEY, built in) and scope EVERY query by the verified
user id. Never return, log or echo an access token, secret or key.

Token encryption: AES-256-GCM, key = PLAID_TOKEN_KEY (base64, 32 bytes),
fresh 12-byte IV per token, stored as "v1.<iv b64>.<ciphertext b64>".

Plaid config: base URL https://<PLAID_ENV>.plaid.com, PLAID_ENV is
'sandbox' or 'production'; the secret is PLAID_SECRET_SANDBOX or
PLAID_SECRET_PRODUCTION to match. Missing config -> clear 500 JSON error.

KEYS — pause here
Append to supabase/functions/.env (gitignored; never print its values):
  PLAID_ENV=sandbox
  PLAID_CLIENT_ID=
  PLAID_SECRET_SANDBOX=
  # PLAID_SECRET_PRODUCTION=        (stays commented out for now)
  PLAID_TOKEN_KEY=<generate 32 random bytes, base64, write it yourself>
  ALLOWED_PLAID_EMAILS=<copy ALLOWED_SCAN_EMAILS' value, do not print it>
Then STOP and tell Joey exactly this: "Open supabase/functions/.env, paste
your Client ID after PLAID_CLIENT_ID= and your Sandbox secret after
PLAID_SECRET_SANDBOX= (both are at dashboard.plaid.com/developers/keys),
save the file, and tell me it's done." Wait for him.

AFTER JOEY SAYS DONE
- npx supabase secrets set --env-file supabase/functions/.env
  --remote=apcqlkkblqrtbkcfmogm (fall back to --project-ref if the CLI
  rejects --remote).
- Deploy the three functions with the same flags extract-bills uses; deploys
  need --yes.

VERIFY (in order; show progress, no silent background shells)
1. npx tsc -p tsconfig.app.json --noEmit · npm run build · npx vitest run
   (284 existing must still pass). New vitest cases: encrypt/decrypt
   round-trip, wrong key fails, transaction mapping incl. a pending row and
   the amount sign, account mapping.
2. Local smoke script (scripts/plaid-smoke.*, reads supabase/functions/.env,
   prints counts only, never keys or tokens): /sandbox/public_token/create
   for ins_109508 with transactions -> exchange -> full sync loop through
   the shared mapping code (retry for up to ~30s while the sandbox's first
   pull is still empty) -> encrypt/decrypt the access token -> /item/remove.
   Expect accounts > 0 and transactions > 0.
3. Live probes: each deployed function without an Authorization header
   returns 401; OPTIONS returns CORS headers.
4. Commit "PP.9.1: Plaid server functions - link token, exchange, sync"
   with explicit-path staging (never .env), push to main, confirm the
   Vercel production deployment for that SHA is READY.

Not verified by this brick, say so in the report: the signed-in path and
the database writes. The next brick (the connect screen) is the first true
end-to-end test.

REPORT
Finish by printing the report between these two lines exactly:
=== REPORT — PP.9.1 ===
=== END REPORT ===
Outcome and commit, departures with reasons, verification table with
pass/fail counts, git status, up to 3 notes. Under 60 lines, no code or
diffs.
