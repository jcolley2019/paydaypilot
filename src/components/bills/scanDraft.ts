import { isISODate, toBillInsert } from '@/lib/billScan'
import { toISODate } from '@/lib/localDate'
import type { BillCandidate } from '@/types/billScan'
import type { BillCategory, BillInsert, CspBucket, DueRule } from '@/types/bills'

export interface DueRuleDraft {
  type: DueRule['type']
  day: number | null
  weeks: string
  anchor: string
  date: string
}

/** Editable state for one scanned candidate on the review screen. */
export interface CandidateDraft {
  key: string
  include: boolean
  duplicateOf: string | null
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
  one_off: 'Pick a date',
}

function ruleDraft(rule: DueRule): DueRuleDraft {
  const today = toISODate(new Date())
  return {
    type: rule.type,
    day: rule.type === 'monthly_day' ? rule.day : null,
    weeks: rule.type === 'interval_weeks' ? String(rule.weeks) : '2',
    anchor: rule.type === 'interval_weeks' ? rule.anchor : today,
    date: rule.type === 'one_off' ? rule.date : today,
  }
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
    case 'one_off':
      return isISODate(rule.date) ? { type: 'one_off', date: rule.date } : null
  }
}

function validAmount(text: string): number | null {
  const amount = Number(text)
  return text.trim() !== '' && Number.isFinite(amount) && amount > 0 ? amount : null
}

/** Possible duplicates start unchecked; everything else starts checked. */
export function draftFromCandidate(candidate: BillCandidate, index: number): CandidateDraft {
  const base = toBillInsert(candidate)
  return {
    key: `${index}-${base.name}`,
    include: !candidate.possible_duplicate_of,
    duplicateOf: candidate.possible_duplicate_of || null,
    name: base.name,
    amount: String(base.amount),
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

export function draftIssues(draft: CandidateDraft): DraftIssues {
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
