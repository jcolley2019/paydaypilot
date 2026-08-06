# PaydayPilot — Project Conventions

## What this is
Payday-centric personal finance app: bills mapped to paychecks, savings buckets,
philosophy modes (Ramit Sethi CSP / Dave Ramsey Baby Steps / hybrid).
Full spec: docs/PRD.md — read it before any feature work.

## Stack
Vite + React + TypeScript + Tailwind (v4, @tailwindcss/vite) + shadcn/ui (nova preset)
+ react-router-dom. Supabase (auth/db/edge functions) and Vercel come in later sprints.
Path alias: "@" → "./src".

## Environment
- Windows, PowerShell syntax for ALL terminal commands (never bash/Unix)
- Dev testing: npm run dev → http://localhost:5173
- Node/npm local install, no docker

## Workflow rules
- Work arrives as sprint prompts (PP.x) with numbered STEPs and a verification gate.
  Execute exactly; if an anchor/precondition fails, STOP and report — do not improvise.
- One feature per prompt. Do not refactor unrelated code.
- NEVER commit unless the prompt explicitly says to. Default is "Do not commit."
- Staging is explicit-path only (git add <file> <file>), never git add -A or git add .
  (sole exception was the initial scaffold commit).
- Commit messages: "PP.x: short description of what shipped".
- All Supabase SQL will be run manually by Joey in the Supabase web SQL editor —
  output SQL as a copy-paste block, never run migrations via CLI.
- Secrets/keys: Joey enters all credentials himself. Never ask for or echo keys.
  Env vars go in .env.local (gitignored), referenced as import.meta.env.VITE_*.

## Verification gates
Every sprint ends with: npm run build passes with zero TS errors, plus the
sprint-specific checks. Report results explicitly.

## Known quirks
- Supabase project is on the FREE joey-tools org and AUTO-PAUSES after ~1 week idle.
  Symptom: login/auth fails with fetch/network errors (NOT "invalid credentials").
  Fix: supabase.com dashboard → paydaypilot → Restore, wait 2–5 min. Do not debug
  auth code for this symptom until pause is ruled out.
