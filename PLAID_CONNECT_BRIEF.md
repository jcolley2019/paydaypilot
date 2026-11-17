PP.9.2 — Bank connections section on Settings (Plaid Link, sandbox)

Read CLAUDE.md and DESIGN.md first. Work directly on main in
C:\dev\paydaypilot. The server side (PP.9.1) is deployed and stays
untouched unless the live test proves a bug in it.

GOAL
A signed-in user connects a bank from Settings, sees its accounts and
balances, and transactions sync on demand and when the app opens. No change
to Dashboard, Bills or any other screen in this brick.

APPROVED LAYOUT (Joey OK'd this; do not redesign)
A new section "Bank connections" on src/pages/Settings.tsx, between Income
and Appearance, same section/heading pattern as those two.
- Empty: one card. Line of copy: "Connect a bank and bills mark themselves
  paid when the charge shows up." A dashed empty box with a bank icon and
  "No banks connected yet." A full-width primary button "Connect a bank".
  Small muted note: "Sign-in happens on your bank's own page through Plaid.
  PaydayPilot never sees your password."
- Connected: heading row shows "Synced <relative time>" on the right. One
  bordered block per bank: bank icon + institution name, a status badge
  ("Connected", or "Needs sign-in" when status is login_required), then one
  row per account: "<name> ··<mask>" left, balance right (money font). Below
  the blocks: two equal buttons "Sync now" and "Add another bank", and a
  muted line "<n> transactions imported".
- A login_required bank also shows a "Reconnect" button in its block.
Tokens only (DESIGN.md): dark = black, burnt-orange accent on the primary
button, no navy, no sparkle icons. Must not scroll sideways at 380px.

BUILD
- npm i react-plaid-link. Open Link only on the button click (create the
  link token on click via the plaid-link-token function), not on page load.
- src/hooks/usePlaid.ts: items (plaid_items, status != 'removed'), accounts
  (source 'plaid'), transaction count, connect(), reconnect(itemId),
  sync(). Functions are called with supabase.functions.invoke, same as
  src/lib/billScan.ts.
- connect: link token -> Link -> onSuccess(public_token) -> plaid-exchange
  -> reload. Show a busy state while the exchange runs (it also does the
  first sync and can take several seconds).
- reconnect: plaid-link-token with { item_id } (update mode) -> Link ->
  plaid-sync with { item_id } -> reload.
- Errors as toasts in plain words: 403 -> "Bank connections aren't turned
  on for this account yet."; 409 already_connected -> "That bank is already
  connected."; anything else -> "Couldn't reach the bank service. Try
  again." User closing Link is not an error: no toast.
- Auto-sync (Joey asked for this explicitly): call plaid-sync by itself
  whenever the app opens after sign-in AND whenever it returns to the
  foreground (visibilitychange/focus; a phone PWA stays open for days),
  if the user has at least one active item and its last_synced_at is older
  than 15 minutes. Never two syncs at once. Silent on success, reload the
  data when it finishes; never blocks the Dashboard from loading. Users
  with no items make no Plaid calls at all. "Sync now" stays as the manual
  override.
- Keep pure helpers (relative "Synced" label, account row label, deciding
  whether auto-sync is due) in a small module with vitest cases.
- PWA: make sure the service worker does not cache or intercept
  cdn.plaid.com or the functions endpoints.
- Out of scope, do not build: OAuth redirect_uri handling, disconnecting a
  bank, anything that matches transactions to bills.

VERIFY (in order; show progress, no silent background shells)
1. npx tsc -p tsconfig.app.json --noEmit · npm run build · npx vitest run
   (299 existing must still pass).
2. Headless 380px render of both states (empty, and connected with fixture
   data incl. one login_required bank) in a throwaway page: no horizontal
   scroll, both themes. Delete the throwaway page afterwards.
3. Commit "PP.9.2: bank connections on Settings - Plaid Link, accounts,
   sync" with explicit-path staging, include PLAID_CONNECT_BRIEF.md, push
   to main, confirm the Vercel production deployment for that SHA is READY.
Do NOT drive a signed-in browser session. Joey runs the live sandbox test
himself right after this brick.

REPORT
Finish by printing the report between these two lines exactly:
=== REPORT — PP.9.2 ===
=== END REPORT ===
Outcome and commit, departures with reasons, verification table with
pass/fail counts, git status, up to 3 notes. Under 60 lines, no code or
diffs.
