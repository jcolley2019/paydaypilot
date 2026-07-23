export type Schedule = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'irregular'

export const SCHEDULES: Schedule[] = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'irregular']

export interface IncomeSource {
  id: string
  user_id: string
  name: string
  net_amount: number
  schedule: Schedule
  anchor_date: string | null
  semimonthly_days: number[] | null
  monthly_day: number | null
  active: boolean
}

export type IncomeSourceInsert = Omit<IncomeSource, 'id' | 'user_id'>
export type IncomeSourceUpdate = Partial<IncomeSourceInsert>

export interface Paycheck {
  id: string
  user_id: string
  income_source_id: string
  pay_date: string
  expected_amount: number
  actual_amount: number | null
}

export type InstanceStatus = 'planned' | 'paid' | 'skipped'
export type InstanceAlert = 'none' | 'due_before_payday'

export interface BillInstance {
  id: string
  user_id: string
  bill_id: string
  due_date: string
  amount: number
  paycheck_id: string | null
  override: boolean
  status: InstanceStatus
  paid_at: string | null
}
