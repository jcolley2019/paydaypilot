import type { BucketKind } from '@/types/buckets'

export const BUCKET_KIND_LABELS: Record<BucketKind, string> = {
  emergency: 'Emergency Fund',
  goal: 'Goal',
  invest: 'Investing',
}
