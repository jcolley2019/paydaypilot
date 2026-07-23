# PaydayPilot — Product Requirements Document

**Version:** 0.1 (July 22, 2026)
**Owner:** Joey Colley
**Status:** Draft — pre-scaffold
**Working repo:** `C:\dev\paydaypilot` (private)
**Stack:** Vite + React + TypeScript + Tailwind + shadcn/ui + Supabase + Vercel

---

## 1. Vision

PaydayPilot is a payday-centric money management app. Instead of a generic monthly budget, it answers the question people actually have: **"From this paycheck, what do I pay, and what do I save?"**

It organizes bills, maps every bill to a specific paycheck, and builds a personalized money plan using proven philosophies — Ramit Sethi's Conscious Spending Plan, Dave Ramsey's Baby Steps, or a hybrid. Savings goals live in named buckets (emergency fund, vacation, investing) with automatic per-paycheck contribution targets.

**Personal-first, SaaS-ready.** Built for Joey + family initially, but architected so multi-tenant SaaS (RapidForge brand) is a config change, not a rewrite.

## 2. Users & Access Model

- Each family member has their own **profile** (Supabase Auth user).
- **Hard data isolation** via Row Level Security — no user can ever read another user's bills, income, or buckets.
- No household sharing in v1 (future: opt-in shared bills for couples).
- Sign-up gated by invite code or email allowlist in v1 (personal deployment; becomes open registration + billing in SaaS mode).

## 3. Philosophy Modes (per profile)

Selected during onboarding, changeable anytime.

### 3a. Conscious Spending Plan (Ramit Sethi)
Four allocation targets as % of take-home pay:
- Fixed costs: 50–60%
- Investments: ~10%
- Savings goals: 5–10%
- Guilt-free spending: 20–35%

App behavior: classifies bills into the four categories, shows actual vs. target %, emphasizes automation ("money moves on payday").

### 3b. Baby Steps (Dave Ramsey)
Sequential progression:
1. $1,000 starter emergency fund
2. Debt snowball (smallest balance first, minimums on the rest)
3. 3–6 months expenses in full emergency fund
4. Invest 15% of household income
5. (Steps 5–7 out of scope for v1: college, mortgage payoff, build wealth)

App behavior: tracks current step, shows progress bar, snowball order for debts, celebrates step completion.

### 3c. Hybrid
Baby Steps 1–3 discipline for emergency fund + debt, then CSP percentages for ongoing allocation. Default recommendation for new users.

## 4. Core Features

### 4.1 Bill Vault
- CRUD for recurring bills: name, amount (fixed or estimated), category, due day/date rule (e.g., "15th", "last day", "every 4 weeks"), autopay flag, payment method note, active/paused.
- One-off bills supported (single due date).
- Debt-type bills carry extra fields: balance, APR, minimum payment (feeds snowball).
- Bill list views: by due date, by category, by assigned paycheck.

### 4.2 Payday Engine (the differentiator)
- Each profile defines one or more **income sources** with a pay schedule: weekly, biweekly (anchor date), semi-monthly (e.g., 1st & 15th), monthly, or irregular (manual entry).
- Engine generates upcoming paychecks (rolling 90-day horizon) and **assigns each bill instance to a paycheck** using the rule: *pay from the last paycheck that lands before the due date, with a configurable safety buffer (default 3 days).*
- Manual override: drag a bill to a different paycheck; override persists for that instance or all future instances.
- **Paycheck view**: for each payday — bills to pay, bucket contributions, remaining guilt-free amount.
- Alerts: "Bill due before your next paycheck," "This paycheck is oversubscribed."

### 4.3 Plan Builder
- Onboarding wizard: income → bills import/entry → philosophy selection → bucket setup → generated plan.
- Output: per-paycheck allocation plan matching the chosen philosophy.
- Recalculates when income, bills, or buckets change.

### 4.4 Savings Buckets
- Named goals: e.g., Emergency Fund, Vacation — Colombia, Investing, New Truck.
- Fields: target amount, target date (optional), current balance, per-paycheck contribution (auto-suggested from plan, editable), icon/color.
- Contribution ledger (manual "I moved the money" confirmations in v1 — the app plans transfers, it does not move money).
- Emergency fund bucket has special status in Ramsey/Hybrid modes (drives Baby Step progress).

### 4.5 Dashboard
- Next payday countdown + that paycheck's plan.
- Bills due in next 14 days.
- Bucket progress rings.
- Philosophy-mode status (CSP % breakdown or current Baby Step).

### 4.6 Data Layer — Manual + Plaid
- **Every account and transaction row carries `source: 'manual' | 'plaid'`.**
- v1 ships fully functional on manual entry.
- Plaid adapter behind a `DataProvider` interface: connect bank (Plaid Link), pull balances + transactions, auto-match transactions to bills ("Netflix charged — mark bill paid?").
- Plaid tier: free Sandbox for dev; Limited Production (200 free calls/product) for initial live testing; Pay-as-you-go plan after. Expected cost for a family: a few dollars/month.
- Plaid is per-profile opt-in. Manual and Plaid accounts coexist.

## 5. Non-Goals (v1)

- Moving money (no payments, no transfers — planning only).
- Household/shared bills.
- Investment tracking beyond a bucket balance.
- Native mobile app (responsive web first; Expo later if wanted).
- SaaS billing/subscriptions (architecture-ready, not built).

## 6. Schema Sketch (Supabase / Postgres)

All tables have `user_id uuid references auth.users` + RLS policy `user_id = auth.uid()` for select/insert/update/delete.

```sql
profiles        (id, user_id, display_name, philosophy 'csp'|'ramsey'|'hybrid',
                 baby_step int, buffer_days int default 3, onboarded bool)

income_sources  (id, user_id, name, net_amount numeric, schedule_type
                 'weekly'|'biweekly'|'semimonthly'|'monthly'|'irregular',
                 anchor_date date, semimonthly_days int[], active bool)

paychecks       (id, user_id, income_source_id, pay_date date,
                 expected_amount numeric, actual_amount numeric null)
                 -- generated rows, 90-day rolling horizon

bills           (id, user_id, name, category, amount numeric,
                 amount_type 'fixed'|'estimate', due_rule jsonb,
                 autopay bool, is_debt bool, debt_balance numeric,
                 debt_apr numeric, debt_min_payment numeric,
                 csp_bucket 'fixed'|'investment'|'savings'|'guilt_free',
                 active bool)

bill_instances  (id, user_id, bill_id, due_date date, amount numeric,
                 paycheck_id fk null, override bool, status
                 'planned'|'paid'|'skipped', paid_at timestamptz)

buckets         (id, user_id, name, icon, color, target_amount numeric,
                 target_date date null, current_balance numeric,
                 per_paycheck numeric, kind 'emergency'|'goal'|'invest',
                 sort int, active bool)

bucket_entries  (id, user_id, bucket_id, paycheck_id fk null,
                 amount numeric, entry_date date, note text)

accounts        (id, user_id, name, type, source 'manual'|'plaid',
                 plaid_item_id text null, plaid_account_id text null,
                 balance numeric, balance_updated_at)

transactions    (id, user_id, account_id, source 'manual'|'plaid',
                 amount, date, merchant, category,
                 matched_bill_instance_id fk null)

plaid_items     (id, user_id, item_id, access_token_encrypted,
                 institution, status)  -- Plaid tokens NEVER in client
```

Notes:
- All SQL run manually in the Supabase web SQL editor (Joey's standard).
- Plaid `access_token` stored server-side only; Plaid calls go through Supabase Edge Functions, never the browser.
- Due-rule stored as jsonb, e.g. `{"type":"monthly_day","day":15}`, `{"type":"last_day"}`, `{"type":"interval_weeks","weeks":4,"anchor":"2026-07-03"}`.

## 7. Payday Engine — Assignment Algorithm

```
for each bill_instance in horizon (next 90 days):
  eligible = paychecks where pay_date <= due_date - buffer_days
  assigned = latest eligible paycheck from same profile
  if none eligible → flag "due before payday" alert, assign earliest paycheck
recompute on: bill change, income change, paycheck actualization, buffer change
manual overrides win and persist per user choice (this instance / all future)
```

Oversubscription check per paycheck: `sum(assigned bills) + sum(bucket per_paycheck) > expected_amount` → warning banner + suggestions (move flexible bills, trim bucket contribution this cycle).

## 8. Sprint Map

| Sprint | Scope | Verification gate |
|--------|-------|-------------------|
| **PP.0** | Scaffold: Vite+React+TS+Tailwind+shadcn, Supabase project, Vercel deploy, dark theme shell, routing | App deploys, blank dashboard renders |
| **PP.1** | Auth + profiles + RLS: sign-up (invite-gated), login, profile row, philosophy picker, RLS on all tables | Two test users cannot see each other's rows |
| **PP.2** | Bill Vault: bills CRUD, due-rule builder, instance generation, list views | Bills render with correct next-due dates incl. month-end edge cases |
| **PP.3** | Payday Engine: income sources, paycheck generation, assignment algorithm, paycheck view, overrides, alerts | Biweekly + semi-monthly test schedules assign correctly with buffer |
| **PP.4** | Savings Buckets: CRUD, contribution ledger, progress UI, dashboard rings | Bucket math correct; emergency bucket drives Baby Step display |
| **PP.5** | Plan Builder + philosophy modes: onboarding wizard, CSP % view, Baby Steps tracker, snowball ordering, oversubscription warnings | Wizard produces coherent plan for all 3 modes |
| **PP.6** | Plaid adapter: Edge Functions, Plaid Link, account/transaction sync, bill matching, source badges | Sandbox institution connects; manual + plaid accounts coexist |

Each sprint = Joey's standard brick workflow: Claude architect writes FIND/REPLACE or file-creation prompts, Claude Code executes, one feature per prompt, explicit-path staging, "Do not commit" until verified.

## 9. Open Questions

1. Invite gating v1: hardcoded allowlist env var vs. invite-code table?
2. Buffer default 3 days — right for your bills' processing times?
3. Bucket balances: purely virtual (tracked in-app) or tied to real savings accounts once Plaid lands?
4. Debt snowball vs. avalanche toggle (Ramsey says snowball; offer avalanche as power-user option?)
5. Domain: paydaypilot.app availability check before Vercel setup.

## 10. Success Criteria (personal v1)

- Joey and at least one family member onboarded with isolated data.
- Every recurring bill assigned to a paycheck with zero missed due dates for one full month.
- Emergency fund bucket funded per plan for 2+ consecutive paychecks.
- Plaid connected to at least one real account with transactions auto-matching bills.
