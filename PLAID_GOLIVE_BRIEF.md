PP.9.3 — Plaid go-live prep: bank-website sign-in (OAuth) return path

Read CLAUDE.md first. Work directly on main in C:\dev\paydaypilot. Stay on
the Plaid SANDBOX in this brick: do not change PLAID_ENV.

WHY
Joey's real banks are Chase and SoFi. Chase (and likely SoFi) sign in on
the bank's own website and then send the browser back to us. Plaid Link
needs a registered redirect_uri for that, and the app must resume Link when
the browser comes back, including inside the installed phone PWA.

BEFORE CODING
Read the current Plaid OAuth guide (https://plaid.com/docs/link/oauth/
index.html.md) and react-plaid-link's OAuth notes. Do not code the flow
from memory.

BUILD
1. Secret PLAID_REDIRECT_URI = https://paydaypilot-sepia.vercel.app/plaid-oauth
   Add it to supabase/functions/.env yourself (it is not sensitive) and
   push secrets (--remote=apcqlkkblqrtbkcfmogm, needs --yes).
2. plaid-link-token: include redirect_uri in /link/token/create ONLY when
   the request's Origin header equals the origin of PLAID_REDIRECT_URI.
   Any other origin (localhost dev) gets a token with no redirect_uri, as
   today. Applies to update-mode tokens too. Redeploy this one function.
3. New route /plaid-oauth inside the signed-in shell (ProtectedRoute, no
   nav entry). Before opening Link, the connect/reconnect flow saves what
   it needs to resume (link token, and the item id for a reconnect) in
   localStorage. /plaid-oauth re-opens Link with that token and
   receivedRedirectUri = the full current URL, then finishes exactly like
   a normal connect/reconnect (exchange or single-bank sync, same toasts)
   and navigates to /settings. Clear the saved state on success, on exit
   and on error. If nothing is saved or the token is stale, go to
   /settings with the toast "That bank sign-in expired. Try connecting
   again." Screen content while it works: the app's normal centered
   loading state with the line "Finishing bank sign-in…". No other UI
   change anywhere.
4. Reuse the existing sync queue in usePlaid so the resumed flow can't
   double-run with auto-sync.
5. vercel.json / router: make sure a hard load of /plaid-oauth?... serves
   the app (SPA fallback) and the service worker's navigateFallback does
   not strip the query string.

PAUSE FOR JOEY (after the code is deployed, before the final checks)
Tell Joey exactly this and wait: "Open
dashboard.plaid.com/developers/api, find 'Allowed redirect URIs', add
https://paydaypilot-sepia.vercel.app/plaid-oauth and save. If that page
looks different, send a screenshot to the architect chat instead of
guessing. Tell me when it's done."

VERIFY (show progress, no silent background shells)
1. npx tsc -p tsconfig.app.json --noEmit · npm run build · npx vitest run
   (317 existing must still pass; add cases for the pure resume-state
   helpers: save, read, stale, clear).
2. After Joey's "done": call the deployed plaid-link-token logic's Plaid
   request shape through scripts/plaid-smoke.ts (extend it): a sandbox
   /link/token/create WITH the redirect_uri must succeed. An
   INVALID_FIELD / redirect-not-allowed error means the dashboard step is
   wrong: report it, don't work around it.
3. Live probe: GET https://paydaypilot-sepia.vercel.app/plaid-oauth?x=1
   returns the app shell (200, HTML), not a 404.
4. Commit "PP.9.3: Plaid OAuth return path for bank-website sign-in" with
   explicit-path staging (never .env), include PLAID_GOLIVE_BRIEF.md, push
   to main, confirm the Vercel production deployment for that SHA is READY.
Do NOT drive a signed-in browser session and do NOT switch to production.

REPORT
Finish by printing the report between these two lines exactly:
=== REPORT — PP.9.3 ===
=== END REPORT ===
Outcome and commit, departures with reasons, verification table with
pass/fail counts, git status, up to 3 notes. Under 60 lines, no code or
diffs. In the notes, say whether PLAID_SECRET_PRODUCTION in .env is set
and uncommented (yes/no only, never the value).
