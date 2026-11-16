import type { BillCategory, CspBucket } from '@/types/bills'

export interface BillDefaults {
  category: BillCategory
  csp_bucket: CspBucket
}

interface GuessRule {
  pattern: RegExp
  category: BillCategory
  csp_bucket?: CspBucket
}

const FALLBACK: BillDefaults = { category: 'other', csp_bucket: 'fixed' }

/**
 * First match wins, so order settles the overlaps: "car insurance" is insurance rather than a
 * car loan, "home loan" is housing rather than debt, "gym membership" is health rather than a
 * subscription. Keywords match whole words — the "rent" in "Brent" doesn't count.
 */
const RULES: GuessRule[] = [
  {
    pattern:
      /\b(insur\w*|geico|allstate|state farm|progressive|usaa|liberty mutual|nationwide|farmers|aflac|metlife|lemonade)\b/,
    category: 'insurance',
  },
  {
    pattern:
      /\b(parking|tolls?|e-?z ?pass|transit|metro|bus pass|train pass|uber|lyft|registration|dmv|fuel|gasoline|car wash)\b/,
    category: 'transportation',
  },
  {
    pattern: /\b(rent|mortgage|home loan|hoa|property tax(es)?|landlord|apartment)\b/,
    category: 'housing',
  },
  {
    pattern:
      /\b(loans?|visa|mastercard|amex|american express|discover|cards?|capital one|citi|synchrony|affirm|klarna|afterpay|sallie mae|navient|nelnet|line of credit|heloc|car|auto|truck)\b/,
    category: 'debt',
  },
  {
    pattern: /\b(401\s?\(?k\)?|roth|ira|brokerage|vanguard|fidelity|schwab|robinhood|invest\w*|index funds?)\b/,
    category: 'other',
    csp_bucket: 'investment',
  },
  {
    pattern: /\b(savings?|emergency fund|sinking fund|rainy day)\b/,
    category: 'other',
    csp_bucket: 'savings',
  },
  {
    pattern:
      /\b(gym|fitness|ymca|peloton|yoga|doctor|dental|dentist|pharmacy|prescriptions?|therap\w*|medical|vision|chiropractor)\b/,
    category: 'health',
  },
  {
    pattern:
      /\b(power|gas|water|electric\w*|energy|utilit\w*|sewer|trash|garbage|internet|wi-?fi|broadband|fiber|cable|phone|mobile|cell\w*|verizon|at&t|att|t-?mobile|comcast|xfinity|spectrum|cox)\b/,
    category: 'utilities',
  },
  {
    pattern:
      /\b(netflix|spotify|hulu|prime|subscriptions?|disney\+?|hbo|youtube|apple|icloud|audible|peacock|paramount\+?|patreon|adobe|dropbox|chatgpt|claude|xbox|playstation|nintendo|sirius\w*|pandora|memberships?)\b/,
    category: 'subscriptions',
  },
  {
    pattern: /\b(grocer\w*|food|meal\w*|hellofresh|blue apron|instacart|doordash)\b/,
    category: 'food',
  },
  {
    pattern:
      /\b(daycare|child ?care|tuition|school|child support|alimony|babysitter|nanny|allowance|pets?|vet|diapers)\b/,
    category: 'family',
  },
]

/** Best guess at a bill's category and CSP bucket from its name alone; unknown names are other/fixed. */
export function guessBillDefaults(name: string): BillDefaults {
  const text = name.toLowerCase()
  const rule = RULES.find(({ pattern }) => pattern.test(text))
  if (!rule) return FALLBACK
  return { category: rule.category, csp_bucket: rule.csp_bucket ?? 'fixed' }
}
