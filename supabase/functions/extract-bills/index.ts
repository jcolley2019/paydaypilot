// PP.7.1 — Bill Scan extractor.
// POST { files: [{ name, mime, data /* base64 */ }], existing: [{ name, amount }] }
//   -> { candidates: Candidate[] } — candidate recurring bills shaped for the `bills` table.
// Auth: the caller's Supabase user JWT; never the service role key.
// Secrets: ANTHROPIC_API_KEY (required), ALLOWED_SCAN_EMAILS (required, comma-separated
// allowlist; anyone else gets 403), ANTHROPIC_MODEL (optional override).
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_FILES = 8
const MAX_FILE_BYTES = 8 * 1024 * 1024
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] as const
// Under the Edge runtime's 150s request limit, so a slow model call still returns a JSON error.
const ANTHROPIC_TIMEOUT_MS = 140_000

const CATEGORIES = [
  'housing',
  'utilities',
  'insurance',
  'transportation',
  'subscriptions',
  'debt',
  'food',
  'health',
  'family',
  'other',
] as const

type Mime = (typeof ALLOWED_MIME)[number]
type Category = (typeof CATEGORIES)[number]

type DueRule =
  | { type: 'monthly_day'; day: number }
  | { type: 'last_day' }
  | { type: 'interval_weeks'; weeks: number; anchor: string }
  | { type: 'one_off'; date: string }

interface Candidate {
  name: string
  amount: number
  amount_type: 'fixed' | 'estimate'
  category: Category
  due_rule: DueRule
  autopay: boolean | null
  is_debt: boolean
  account_type: 'card' | 'loan' | null
  debt_balance: number | null
  debt_apr: number | null
  debt_min_payment: number | null
  credit_limit: number | null
  min_payment_percent: number | null
  min_payment_floor: number | null
  confidence: number
  evidence: string
  source_file: string
  possible_duplicate_of: string | null
}

interface ScanFile {
  name: string
  mime: Mime
  data: string
}

interface ExistingBill {
  name: string
  amount: number
}

interface AnthropicMessage {
  stop_reason?: string | null
  content?: { type: string; name?: string; input?: unknown; text?: string }[]
}

const INSTRUCTIONS = `Find the user's RECURRING bills in these bank/card statements and banking-app screenshots, then call report_bills exactly once with every candidate (an empty list if there are none).
- Extract recurring obligations only: subscriptions, utilities, insurance, rent/mortgage, loan and card payments, phone, etc.
- Ignore one-off purchases, groceries, fuel, restaurants, transfers, deposits, income and fees.
- A credit-card statement itself yields ONE candidate: the card payment. is_debt true, account_type "card", amount = the minimum payment, amount_type "estimate"; fill debt_balance, debt_apr, debt_min_payment, credit_limit, min_payment_percent and min_payment_floor when the statement shows them.
- Loan statements: is_debt true, account_type "loan".
- Use the most recent charge amount; amount_type "estimate" when amounts vary.
- due_rule day = the recurring charge day.
- Merge the same merchant across files into one candidate.
- Compare against the existing bills by merchant name/amount; on a match set possible_duplicate_of to that bill's exact name.
- Percentages are plain numbers (24.99 means 24.99%). source_file is the file name as listed below.`

const ISO_DATE_SCHEMA = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
const NULLABLE_NUMBER = { type: ['number', 'null'] }

const CANDIDATE_PROPERTIES = {
  name: { type: 'string', description: 'Merchant or bill name, e.g. "Netflix"' },
  amount: { type: 'number', exclusiveMinimum: 0, description: 'Dollars per charge' },
  amount_type: { type: 'string', enum: ['fixed', 'estimate'] },
  category: { type: 'string', enum: CATEGORIES },
  due_rule: {
    description:
      'monthly_day (day = the charge day) | last_day | interval_weeks (weekly/biweekly; anchor = a recent charge date) | one_off',
    anyOf: [
      {
        type: 'object',
        properties: { type: { const: 'monthly_day' }, day: { type: 'integer', minimum: 1, maximum: 31 } },
        required: ['type', 'day'],
      },
      {
        type: 'object',
        properties: { type: { const: 'last_day' } },
        required: ['type'],
      },
      {
        type: 'object',
        properties: {
          type: { const: 'interval_weeks' },
          weeks: { type: 'integer', minimum: 1 },
          anchor: ISO_DATE_SCHEMA,
        },
        required: ['type', 'weeks', 'anchor'],
      },
      {
        type: 'object',
        properties: { type: { const: 'one_off' }, date: ISO_DATE_SCHEMA },
        required: ['type', 'date'],
      },
    ],
  },
  autopay: { type: ['boolean', 'null'], description: 'null when the file does not say' },
  is_debt: { type: 'boolean' },
  account_type: { enum: ['card', 'loan', null] },
  debt_balance: NULLABLE_NUMBER,
  debt_apr: { type: ['number', 'null'], description: 'APR percent, e.g. 24.99' },
  debt_min_payment: NULLABLE_NUMBER,
  credit_limit: NULLABLE_NUMBER,
  min_payment_percent: { type: ['number', 'null'], description: 'Percent of balance, e.g. 1 for 1%' },
  min_payment_floor: { type: ['number', 'null'], description: 'Dollar floor of the minimum payment' },
  confidence: { type: 'number', minimum: 0, maximum: 1 },
  evidence: { type: 'string', description: 'Short proof, e.g. "charged 3x: Jul 12, Aug 12, Sep 12"' },
  source_file: { type: 'string', description: 'File name as listed in the prompt' },
  possible_duplicate_of: {
    type: ['string', 'null'],
    description: 'Exact name of the matching existing bill, else null',
  },
}

const REPORT_BILLS_TOOL = {
  name: 'report_bills',
  description: 'Report every recurring bill found in the files. Call exactly once, with all candidates.',
  input_schema: {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: CANDIDATE_PROPERTIES,
          required: Object.keys(CANDIDATE_PROPERTIES),
        },
      },
    },
    required: ['candidates'],
  },
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function fail(status: number, error: string): Response {
  if (status >= 500) console.error(`extract-bills ${status}: ${error}`)
  return json({ error }, status)
}

function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isMime(value: unknown): value is Mime {
  return (ALLOWED_MIME as readonly unknown[]).includes(value)
}

function isCategory(value: unknown): value is Category {
  return (CATEGORIES as readonly unknown[]).includes(value)
}

function isBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value)
}

function decodedBytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return (base64.length / 4) * 3 - padding
}

function parseRequest(body: unknown): { files: ScanFile[]; existing: ExistingBill[] } | string {
  const { files, existing = [] } = (body ?? {}) as Record<string, unknown>
  if (!Array.isArray(files) || files.length < 1 || files.length > MAX_FILES) {
    return `files must be an array of 1-${MAX_FILES} items`
  }

  const parsedFiles: ScanFile[] = []
  for (const [index, item] of files.entries()) {
    const file = (item ?? {}) as Record<string, unknown>
    if (typeof file.name !== 'string') return `file ${index + 1}: name must be a string`
    const label = file.name || `file ${index + 1}`
    if (!isMime(file.mime)) return `${label}: type must be one of ${ALLOWED_MIME.join(', ')}`
    if (typeof file.data !== 'string' || !isBase64(file.data)) return `${label}: data must be non-empty base64`
    if (decodedBytes(file.data) > MAX_FILE_BYTES) return `${label}: larger than 8 MB`
    parsedFiles.push({ name: file.name, mime: file.mime, data: file.data })
  }

  if (!Array.isArray(existing)) return 'existing must be an array'
  const parsedExisting: ExistingBill[] = []
  for (const item of existing) {
    const bill = (item ?? {}) as Record<string, unknown>
    if (typeof bill.name !== 'string' || typeof bill.amount !== 'number' || !Number.isFinite(bill.amount)) {
      return 'existing items must be { name: string, amount: number }'
    }
    parsedExisting.push({ name: bill.name, amount: bill.amount })
  }

  return { files: parsedFiles, existing: parsedExisting }
}

function buildContent(files: ScanFile[], existing: ExistingBill[]): unknown[] {
  const blocks: unknown[] = files.map((file) =>
    file.mime === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
      : { type: 'image', source: { type: 'base64', media_type: file.mime, data: file.data } },
  )
  const today = new Date().toISOString().slice(0, 10)
  const fileList = files.map((file, index) => `${index + 1}. ${JSON.stringify(file.name)}`).join('\n')
  blocks.push({
    type: 'text',
    text: `${INSTRUCTIONS}\n\nToday's date is ${today}.\n\nFiles, in order:\n${fileList}\n\nExisting bills: ${JSON.stringify(existing)}`,
  })
  return blocks
}

function normalizeDueRule(value: unknown): DueRule {
  const rule = (value ?? {}) as Record<string, unknown>
  if (rule.type === 'monthly_day') {
    const day = num(rule.day)
    if (day !== null) return { type: 'monthly_day', day: Math.min(31, Math.max(1, Math.round(day))) }
  } else if (rule.type === 'last_day') {
    return { type: 'last_day' }
  } else if (rule.type === 'interval_weeks') {
    const weeks = num(rule.weeks)
    if (weeks !== null && weeks >= 1 && isIsoDate(rule.anchor)) {
      return { type: 'interval_weeks', weeks: Math.round(weeks), anchor: rule.anchor }
    }
  } else if (rule.type === 'one_off') {
    if (isIsoDate(rule.date)) return { type: 'one_off', date: rule.date }
  }
  return { type: 'monthly_day', day: 1 }
}

function normalizeCandidate(value: unknown, existing: ExistingBill[]): Candidate | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const amount = num(raw.amount)
  if (!name || amount === null || amount <= 0) return null

  // Only a name that really is in `existing` counts as a duplicate pointer.
  const duplicateKey = typeof raw.possible_duplicate_of === 'string' ? raw.possible_duplicate_of.trim().toLowerCase() : ''
  const duplicate = duplicateKey ? existing.find((bill) => bill.name.trim().toLowerCase() === duplicateKey) : undefined

  return {
    name,
    amount,
    amount_type: raw.amount_type === 'fixed' ? 'fixed' : 'estimate',
    category: isCategory(raw.category) ? raw.category : 'other',
    due_rule: normalizeDueRule(raw.due_rule),
    autopay: typeof raw.autopay === 'boolean' ? raw.autopay : null,
    is_debt: raw.is_debt === true,
    account_type: raw.account_type === 'card' || raw.account_type === 'loan' ? raw.account_type : null,
    debt_balance: num(raw.debt_balance),
    debt_apr: num(raw.debt_apr),
    debt_min_payment: num(raw.debt_min_payment),
    credit_limit: num(raw.credit_limit),
    min_payment_percent: num(raw.min_payment_percent),
    min_payment_floor: num(raw.min_payment_floor),
    confidence: Math.min(1, Math.max(0, num(raw.confidence) ?? 0)),
    evidence: typeof raw.evidence === 'string' ? raw.evidence.trim() : '',
    source_file: typeof raw.source_file === 'string' ? raw.source_file : '',
    possible_duplicate_of: duplicate ? duplicate.name : null,
  }
}

function anthropicErrorText(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: unknown } }
    if (typeof parsed.error?.message === 'string') return parsed.error.message
  } catch {
    // Not JSON — pass the raw text through.
  }
  return raw.slice(0, 500)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = /^Bearer\s+(\S+)$/i.exec(authHeader)?.[1]
    if (!jwt) return fail(401, 'Missing bearer token')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !supabaseAnonKey) return fail(500, 'SUPABASE_URL / SUPABASE_ANON_KEY not set')
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const {
      data: { user },
    } = await supabase.auth.getUser(jwt)
    if (!user) return fail(401, 'Not signed in')

    // Signups are open, so only allowlisted accounts may spend the Anthropic key. Fails closed.
    const allowedEmails = (Deno.env.get('ALLOWED_SCAN_EMAILS') ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
    const email = user.email?.trim().toLowerCase()
    if (!email || !allowedEmails.includes(email)) return fail(403, "Bill scanning isn't enabled for this account")

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return fail(500, 'ANTHROPIC_API_KEY not set')

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return fail(400, 'Body must be JSON')
    }
    const parsed = parseRequest(body)
    if (typeof parsed === 'string') return fail(400, parsed)

    let res: Response
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5',
          max_tokens: 4096,
          // Sonnet 5.5 thinks by default and thinking counts toward max_tokens; low effort is the
          // documented setting for extraction and keeps the report inside the 4096 budget.
          output_config: { effort: 'low' },
          tools: [REPORT_BILLS_TOOL],
          // Sonnet 5.5 rejects forced tool_choice ('tool' / 'any') with a 400, so the prompt asks
          // for exactly one report_bills call and the response is checked for it below.
          tool_choice: { type: 'auto', disable_parallel_tool_use: true },
          messages: [{ role: 'user', content: buildContent(parsed.files, parsed.existing) }],
        }),
        signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
      })
    } catch (err) {
      const timedOut = (err as { name?: string } | null)?.name === 'TimeoutError'
      return fail(502, timedOut ? 'Anthropic request timed out' : `Anthropic request failed: ${String(err)}`)
    }
    if (!res.ok) return fail(502, `Anthropic ${res.status}: ${anthropicErrorText(await res.text())}`)

    const message = (await res.json()) as AnthropicMessage
    if (message.stop_reason === 'refusal') return fail(502, 'The model declined to read these files')
    if (message.stop_reason === 'max_tokens') {
      return fail(502, 'The model ran out of room before finishing - scan fewer files at a time')
    }
    const call = message.content?.find((block) => block.type === 'tool_use' && block.name === 'report_bills')
    if (!call) {
      const text = (message.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join(' ')
        .trim()
      return fail(502, `The model did not report bills${text ? `: ${text.slice(0, 300)}` : ''}`)
    }
    const rawCandidates = (call.input as { candidates?: unknown } | undefined)?.candidates
    if (!Array.isArray(rawCandidates)) return fail(502, 'report_bills returned no candidates array')

    const candidates = rawCandidates
      .map((candidate) => normalizeCandidate(candidate, parsed.existing))
      .filter((candidate): candidate is Candidate => candidate !== null)
    return json({ candidates })
  } catch (err) {
    console.error('extract-bills unexpected error', err)
    return json({ error: 'Unexpected error' }, 500)
  }
})
