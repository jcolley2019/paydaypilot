import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useBills } from '@/hooks/useBills'
import { BillCard } from '@/components/bills/BillCard'
import { BillFormDialog } from '@/components/bills/BillFormDialog'
import { nextDueDate } from '@/lib/dueRules'
import type { Bill, BillInsert } from '@/types/bills'

function monthlyEstimate(bills: Bill[]): number {
  return bills
    .filter((b) => b.active)
    .reduce((sum, bill) => {
      switch (bill.due_rule.type) {
        case 'monthly_day':
        case 'last_day':
          return sum + bill.amount
        case 'interval_weeks':
          return sum + (bill.amount * 52) / bill.due_rule.weeks / 12
        case 'one_off':
          return sum
      }
    }, 0)
}

function sortBills(bills: Bill[]): Bill[] {
  const now = new Date()
  return [...bills].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    const aNext = nextDueDate(a.due_rule, now)
    const bNext = nextDueDate(b.due_rule, now)
    if (!aNext && !bNext) return 0
    if (!aNext) return 1
    if (!bNext) return -1
    return aNext.getTime() - bNext.getTime()
  })
}

export function Bills() {
  const { bills, loading, createBill, updateBill, deleteBill } = useBills()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBill, setEditingBill] = useState<Bill | null>(null)

  const sorted = useMemo(() => sortBills(bills), [bills])
  const monthlyTotal = useMemo(() => monthlyEstimate(bills), [bills])

  function openAddDialog() {
    setEditingBill(null)
    setDialogOpen(true)
  }

  function openEditDialog(bill: Bill) {
    setEditingBill(bill)
    setDialogOpen(true)
  }

  async function handleSubmit(values: BillInsert) {
    if (editingBill) {
      await updateBill(editingBill.id, values)
    } else {
      await createBill(values)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bills</h1>
          <p className="text-sm text-muted-foreground">
            ~
            {monthlyTotal.toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            estimated per month
          </p>
        </div>
        <Button type="button" onClick={openAddDialog}>
          <Plus className="size-4" />
          Add bill
        </Button>
      </div>

      {!loading && sorted.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No bills yet</CardTitle>
            <CardDescription>Add your first one to start tracking what's due.</CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {sorted.map((bill) => (
          <BillCard key={bill.id} bill={bill} onEdit={openEditDialog} onDelete={deleteBill} />
        ))}
      </div>

      <BillFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        bill={editingBill}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
