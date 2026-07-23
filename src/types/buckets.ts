export type BucketKind = 'emergency' | 'goal' | 'invest'

export const BUCKET_KINDS: BucketKind[] = ['emergency', 'goal', 'invest']

export const BUCKET_COLORS = [
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
] as const

export const BUCKET_ICON_NAMES = [
  'PiggyBank',
  'ShieldCheck',
  'Plane',
  'Home',
  'GraduationCap',
  'TrendingUp',
] as const

export type BucketIconName = (typeof BUCKET_ICON_NAMES)[number]

export interface Bucket {
  id: string
  user_id: string
  name: string
  icon: string
  color: string
  kind: BucketKind
  target_amount: number | null
  target_date: string | null
  current_balance: number
  per_paycheck: number
  sort: number
  active: boolean
  created_at: string
}

export type BucketInsert = Omit<Bucket, 'id' | 'user_id' | 'current_balance' | 'created_at'>
export type BucketUpdate = Partial<BucketInsert>

export interface BucketEntry {
  id: string
  user_id: string
  bucket_id: string
  paycheck_id: string | null
  amount: number
  entry_date: string
  note: string | null
  created_at: string
}
