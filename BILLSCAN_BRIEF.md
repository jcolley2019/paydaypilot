# PP.7.1 — Bill Scan extractor (Edge Function + client wrapper)

Goal: let Joey drop bank/card statements (PDF) or banking-app screenshots (PNG/JPG)
and get back a list of candidate recurring bills shaped for our `bills` table.
This brick builds the extractor only. PP.7.2 builds the Import page UI on top.

Read CLAUDE.md first. One feature; do not touch unrelated code.

## STEP 1 — Edge Function: supabase/functions/extract-bills/index.ts
Deno Edge Function (no supabase/ dir exists yet — create supabase/functions/extract-bills/).
Also create supabase/functions/extract-bills/deno.json with `{"imports":{}}` (empty is fine).

Behavior:
- Handle OPTIONS with CORS headers (Access-Control-Allow-Origin: *, Allow-Headers:
  authorization, x-client-info, apikey, content-type). All responses carry CORS headers.
- Auth: require `Authorization: Bearer <user jwt>`. Create a supabase-js client
  (npm:@supabase/supabase-js@2) with SUPABASE_URL + SUPABASE_ANON_KEY from Deno.env and
  the request's Authorization header passed as global header; call auth.getUser().
  401 if no user. Never use the service role key.
- Body JSON: `{ files: [{ name: string, mime: string, data: string /*base64*/ }],
  existing: [{ name: string, amount: number }] }`. Limits: 1–8 files, each ≤ 8 MB decoded,
  mime in image/png, image/jpeg, image/webp, application/pdf. 400 otherwise.
- Call Anthropic Messages API via fetch (https://api.anthropic.com/v1/messages,
  headers x-api-key = Deno.env ANTHROPIC_API_KEY, anthropic-version 2023-06-01).
  Model = Deno.env ANTHROPIC_MODEL ?? 'claude-sonnet-5-5'. max_tokens 4096.
  PDFs go as `{type:'document', source:{type:'base64', media_type:'application/pdf', data}}`,
  images as `{type:'image', source:{type:'base64', media_type, data}}`, then one text block
  with the instructions. 500 if ANTHROPIC_API_KEY missing; pass Anthropic error text through
  on non-2xx (status 502).
- Force structured output with a single tool `report_bills` and
  `tool_choice: {type:'tool', name:'report_bills'}`. Tool input schema:
  `{ candidates: Candidate[] }` where Candidate =
  name (string), amount (number, positive), amount_type ('fixed'|'estimate'),
  category (one of: housing, utilities, insurance, transportation, subscriptions, debt,
  food, health, family, other), due_rule (one of
  {type:'monthly_day', day:1-31} | {type:'last_day'} |
  {type:'interval_weeks', weeks:number, anchor:'YYYY-MM-DD'} | {type:'one_off', date:'YYYY-MM-DD'}),
  autopay (boolean|null), is_debt (boolean), account_type ('card'|'loan'|null),
  debt_balance, debt_apr, debt_min_payment, credit_limit, min_payment_percent,
  min_payment_floor (all number|null), confidence (0–1), evidence (short string, e.g.
  "charged 3x: Jul 12, Aug 12, Sep 12"), source_file (string),
  possible_duplicate_of (string|null — an `existing` bill name if it looks like the same bill).
- Instruction text (put in a const, keep it tight): extract RECURRING obligations only —
  subscriptions, utilities, insurance, rent/mortgage, loan and card payments, phone, etc.
  Ignore one-off purchases, groceries, fuel, restaurants, transfers, deposits, income, fees.
  A credit-card statement itself yields ONE candidate: the card payment (is_debt true,
  account_type 'card', fill balance/APR/min payment/limit/min % and floor when shown on the
  statement; amount = minimum payment, amount_type 'estimate'). Loan statements → is_debt
  true, account_type 'loan'. Use the most recent charge amount; amount_type 'estimate' when
  amounts vary. due_rule day = the recurring charge day. Merge the same merchant across
  files into one candidate. Compare against the `existing` list by merchant name/amount and
  set possible_duplicate_of when it matches. Today's date is <ISO date, injected>.
- Response: `{ candidates: Candidate[] }` (validate it is an array; coerce missing
  nullable fields to null; drop candidates with no name or amount ≤ 0).

## STEP 2 — client types + wrapper
- src/types/billScan.ts: export `BillCandidate` matching the tool schema above, plus
  `ScanRequest`/`ScanResponse`.
- src/lib/billScan.ts:
  - `async function scanBills(files: File[], existing: {name:string; amount:number}[]):
    Promise<BillCandidate[]>` — base64-encode each File (FileReader → strip data: prefix),
    enforce the same limits client-side with clear Error messages, call
    `supabase.functions.invoke('extract-bills', { body })`, throw on error, return candidates.
  - `function toBillInsert(c: BillCandidate): BillInsert` — pure mapper. Defaults:
    csp_bucket 'fixed', active true, payment_method null, notes = c.evidence || null,
    category fallback 'other' if invalid, due_rule fallback {type:'monthly_day', day:1}
    if invalid/missing, day clamped 1–31, is_debt false if missing, nullable numerics → null.
    Reuse existing enums/constants from src/types/bills.ts; do not redefine them.
- src/lib/billScan.test.ts (vitest, match existing test style in src/lib): cover
  toBillInsert happy path, invalid category → 'other', missing due_rule → monthly_day 1,
  day 40 → 31, card candidate keeps account_type/credit fields.

## STEP 3 — housekeeping
- Add `AGENTS.md` to .gitignore (it is a local claude-mem dump, untracked today).
- Do NOT create or edit any .env file in this brick (the key is a Supabase secret, set later).
- Do NOT deploy the function; the architect deploys it through the Supabase connector.

## VERIFY (print as a pass/fail table)
1. `npx tsc --noEmit` — 0 errors
2. `npm run build` — passes
3. `npx vitest run src/lib/billScan.test.ts` — all pass; also run the full suite once
4. `deno check supabase/functions/extract-bills/index.ts` if deno is on PATH; if not,
   mark "skipped (no deno)" — not a failure
5. `git status` shows only the new files + .gitignore change

## COMMIT (explicit paths only)
Stage: supabase/functions/extract-bills/index.ts, supabase/functions/extract-bills/deno.json,
src/types/billScan.ts, src/lib/billScan.ts, src/lib/billScan.test.ts, .gitignore, BILLSCAN_BRIEF.md
Message: "PP.7.1: bill scan extractor - Edge Function + client wrapper"
Then `git push origin main`.

Print the final report between the lines
=== REPORT — PP.7.1 ===
and
=== END REPORT ===
(outcome/commit hash, spec departures with reasons, verification table, git status,
up to 3 worth-knowing notes; under 60 lines; no code/diffs).
