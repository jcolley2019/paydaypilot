import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { parseISODate, toISODate } from '@/lib/localDate'
import { ACCOUNT_TYPES, BILL_CATEGORIES } from '@/types/bills'
import type { BillInsert, DueRule } from '@/types/bills'
import { SCAN_MIME_TYPES } from '@/types/billScan'
import type { BillCandidate, ScanFile, ScanMime, ScanRequest, ScanResponse } from '@/types/billScan'

export const MAX_SCAN_FILES = 8
export const MAX_SCAN_FILE_BYTES = 8 * 1024 * 1024

function isScanMime(mime: string): mime is ScanMime {
  return (SCAN_MIME_TYPES as string[]).includes(mime)
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    reader.readAsDataURL(file)
  })
}

async function invokeErrorMessage(error: unknown): Promise<string> {
  // Non-2xx responses carry the function's own { error } message in the body.
  if (error instanceof FunctionsHttpError) {
    try {
      const body: unknown = await error.context.json()
      const message = (body as { error?: unknown } | null)?.error
      if (typeof message === 'string') return message
    } catch {
      // Fall back to the generic message below.
    }
  }
  return error instanceof Error ? error.message : 'Bill scan failed.'
}

export async function scanBills(
  files: File[],
  existing: { name: string; amount: number }[],
): Promise<BillCandidate[]> {
  if (files.length === 0) throw new Error('Add at least one statement or screenshot to scan.')
  if (files.length > MAX_SCAN_FILES) throw new Error(`Scan at most ${MAX_SCAN_FILES} files at a time.`)
  for (const file of files) {
    if (!isScanMime(file.type)) throw new Error(`${file.name}: only PDF, PNG, JPG, or WebP files can be scanned.`)
    if (file.size === 0) throw new Error(`${file.name} is empty.`)
    if (file.size > MAX_SCAN_FILE_BYTES) throw new Error(`${file.name} is over the 8 MB limit.`)
  }

  const encoded: ScanFile[] = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      mime: file.type as ScanMime,
      data: await readAsBase64(file),
    })),
  )
  const body: ScanRequest = {
    files: encoded,
    existing: existing.map(({ name, amount }) => ({ name, amount })),
  }

  const { data, error } = await supabase.functions.invoke<ScanResponse>('extract-bills', { body })
  if (error) throw new Error(await invokeErrorMessage(error))
  if (!data || !Array.isArray(data.candidates)) throw new Error('Bill scan returned an unexpected response.')
  return data.candidates
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isISODate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE_PATTERN.test(value) && toISODate(parseISODate(value)) === value
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toDueRule(value: unknown): DueRule {
  const rule = (value ?? {}) as Record<string, unknown>
  switch (rule.type) {
    case 'monthly_day': {
      const day = finiteOrNull(rule.day)
      if (day !== null) return { type: 'monthly_day', day: Math.min(31, Math.max(1, Math.round(day))) }
      break
    }
    case 'last_day':
      return { type: 'last_day' }
    case 'interval_weeks': {
      const weeks = finiteOrNull(rule.weeks)
      if (weeks !== null && weeks >= 1 && isISODate(rule.anchor)) {
        return { type: 'interval_weeks', weeks: Math.round(weeks), anchor: rule.anchor }
      }
      break
    }
    case 'one_off':
      if (isISODate(rule.date)) return { type: 'one_off', date: rule.date }
      break
  }
  return { type: 'monthly_day', day: 1 }
}

export function toBillInsert(c: BillCandidate): BillInsert {
  return {
    name: c.name.trim(),
    category: BILL_CATEGORIES.includes(c.category) ? c.category : 'other',
    amount: c.amount,
    amount_type: c.amount_type === 'fixed' ? 'fixed' : 'estimate',
    due_rule: toDueRule(c.due_rule),
    autopay: c.autopay === true,
    payment_method: null,
    is_debt: c.is_debt === true,
    debt_balance: finiteOrNull(c.debt_balance),
    debt_apr: finiteOrNull(c.debt_apr),
    debt_min_payment: finiteOrNull(c.debt_min_payment),
    account_type: c.account_type !== null && ACCOUNT_TYPES.includes(c.account_type) ? c.account_type : null,
    credit_limit: finiteOrNull(c.credit_limit),
    min_payment_percent: finiteOrNull(c.min_payment_percent),
    min_payment_floor: finiteOrNull(c.min_payment_floor),
    csp_bucket: 'fixed',
    active: true,
    notes: c.evidence || null,
  }
}
