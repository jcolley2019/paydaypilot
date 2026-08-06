import { LayoutDashboard, Receipt, PiggyBank, Map, CreditCard, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Bills', path: '/bills', icon: Receipt },
  { label: 'Buckets', path: '/buckets', icon: PiggyBank },
  { label: 'Credit', path: '/credit', icon: CreditCard },
  { label: 'Plan', path: '/plan', icon: Map },
  { label: 'Settings', path: '/settings', icon: Settings },
]
