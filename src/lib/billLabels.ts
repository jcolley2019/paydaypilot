import type { BillCategory, CspBucket } from '@/types/bills'

export const CATEGORY_LABELS: Record<BillCategory, string> = {
  housing: 'Housing',
  utilities: 'Utilities',
  insurance: 'Insurance',
  transportation: 'Transportation',
  subscriptions: 'Subscriptions',
  debt: 'Debt',
  food: 'Food',
  health: 'Health',
  family: 'Family',
  other: 'Other',
}

export const CSP_BUCKET_LABELS: Record<CspBucket, string> = {
  fixed: 'Fixed Costs',
  investment: 'Investments',
  savings: 'Savings Goals',
  guilt_free: 'Guilt-Free Spending',
}

export function formatAmount(amount: number, amountType: 'fixed' | 'estimate'): string {
  const formatted = amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return amountType === 'estimate' ? `~${formatted}` : formatted
}
