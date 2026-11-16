import { isISODate, toBillInsert } from '@/lib/billScan'
import { isValidIntervalMonths } from '@/lib/dueRules'
import { amountUpdate, chooseAction, findMatch, type BillMatch, type ImportAction } from '@/lib/importActions'
import { toISODate } from '@/lib/localDate'
import type { BillCandidate } from '@/types/billScan'
import type { Bill, BillCategory, BillInsert, BillUpdate, CspBucket, DueRule } from '@/types/bills'

export interface DueRuleDraft {
  type: DueRule['type']
  day: number | null
  weeks: string
  months: string
  anchor: string
  date: string
}

/** Editable state for one scanned candidate on the review screen. */
export interface CandidateDraft {
  key: string
  /** The existing bill this candidate matched, if any. */
  match: BillMatch | null
  /** The user's pick; null keeps the default from chooseAction. */
  override: ImportAction | null
  name: string
  amount: string
  category: BillCategory
  rule: DueRuleDraft
  cspBucket: CspBucket
  autopay: boolean
  /** The mapped insert; review edits are layered on top and the rest (debt fields, notes) passes through. */
  base: BillInsert
  evidence: string
  sourceFile: string
  confidence: number
}

export interface DraftIssues {
  name?: string
  amount?: string
  rule?: string
}

const RULE_ISSUES: Record<DueRule['type'], string> = {
  monthly_day: 'Pick a day',
  last_day: '',
  interval_weeks: 'Enter whole weeks and a start date',
  interval_months: 'Enter 2–24 months and the most recent due date',
  one_off: 'Pick a date',
}

function ruleDraft(rule: DueRule): DueRuleDraft {
  const today = toISODate(new Date())
  return {
    type: rule.type,
    day: rule.type === 'monthly_day' ? rule.day : null,
    weeks: rule.type === 'interval_weeks' ? String(rule.weeks) : '2',
    months: rule.type === 'interval_months' ? String(rule.months) : '3',
    anchor: rule.type === 'interval_weeks' || rule.type === 'interval_months' ? rule.anchor : today,
    date: rule.type === 'one_off' ? rule.date : today,
  }
}

/** The interval_months rule for typed-in months + anchor, or null while incomplete. */
export function intervalMonthsRule(months: string, anchor: string): DueRule | null {
  const n = Number(months)
  return months.trim() !== '' && isValidIntervalMonths(n) && isISODate(anchor)
    ? { type: 'interval_months', months: n, anchor }
    : null
}

/** The due rule a draft describes, or null while it's incomplete. */
export function buildDueRule(rule: DueRuleDraft): DueRule | null {
  switch (rule.type) {
    case 'monthly_day':
      return rule.day === null ? null : { type: 'monthly_day', day: rule.day }
    case 'last_day':
      return { type: 'last_day' }
    case 'interval_weeks': {
      const weeks = Number(rule.weeks)
      return Number.isInteger(weeks) && weeks >= 1 && isISODate(rule.anchor)
        ? { type: 'interval_weeks', weeks, anchor: rule.anchor }
        : null
    }
    case 'interval_months':
      return intervalMonthsRule(rule.months, rule.anchor)
    case 'one_off':
      return isISODate(rule.date) ? { type: 'one_off', date: rule.date } : null
  }
}

function validAmount(text: string): number | null {
  const amount = Number(text)
  return text.trim() !== '' && Number.isFinite(amount) && amount > 0 ? amount : null
}

export function draftFromCandidate(
  candidate: BillCandidate,
  index: number,
  bills: Pick<Bill, 'id' | 'name' | 'amount'>[],
): CandidateDraft {
  const base = toBillInsert(candidate)
  return {
    key: `${index}-${base.name}`,
    match: findMatch(candidate.possible_duplicate_of, bills),
    override: null,
    name: base.name,
    amount: base.amount.toFixed(2),
    category: base.category,
    rule: ruleDraft(base.due_rule),
    cspBucket: base.csp_bucket,
    autopay: base.autopay,
    base,
    evidence: candidate.evidence,
    sourceFile: candidate.source_file,
    confidence: candidate.confidence,
  }
}

/** Add, update, or skip — judged on the extracted amount, so editing the amount doesn't flip it. */
export function draftAction(draft: CandidateDraft): ImportAction {
  return chooseAction(draft.base.amount, draft.match, draft.override)
}

/** What still needs fixing; an update only needs a valid amount. */
export function draftIssues(draft: CandidateDraft): DraftIssues {
  if (draftAction(draft) === 'update') {
    return { amount: validAmount(draft.amount) === null ? 'Enter an amount' : undefined }
  }
  return {
    name: draft.name.trim() ? undefined : 'Add a name',
    amount: validAmount(draft.amount) === null ? 'Enter an amount' : undefined,
    rule: buildDueRule(draft.rule) ? undefined : RULE_ISSUES[draft.rule.type],
  }
}

/** The bill to insert for a finished draft, or null while it still has issues. */
export function draftToInsert(draft: CandidateDraft): BillInsert | null {
  const name = draft.name.trim()
  const amount = validAmount(draft.amount)
  const dueRule = buildDueRule(draft.rule)
  if (!name || amount === null || !dueRule) return null
  return {
    ...draft.base,
    name,
    amount,
    category: draft.category,
    due_rule: dueRule,
    csp_bucket: draft.cspBucket,
    autopay: draft.autopay,
  }
}

/** The amount-only update for a matched draft, or null while its amount is invalid. */
export function draftToUpdate(draft: CandidateDraft): { id: string; updates: BillUpdate } | null {
  const amount = validAmount(draft.amount)
  if (!draft.match || amount === null) return null
  return { id: draft.match.id, updates: amountUpdate(amount, draft.base.amount_type) }
}
