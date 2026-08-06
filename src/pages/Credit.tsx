import { useMemo, useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useBills } from '@/hooks/useBills'
import { snowballOrder } from '@/lib/plan'
import { CreditAccountCard } from '@/components/credit/CreditAccountCard'
import { SnowballList } from '@/components/plan/SnowballList'
import { BillFormDialog } from '@/components/bills/BillFormDialog'
import type { Bill, BillInsert } from '@/types/bills'

function sortDebts(bills: Bill[]): Bill[] {
  return [...bills].sort((a, b) => (b.debt_balance ?? 0) - (a.debt_balance ?? 0))
}

export function Credit() {
  const { bills, loading, updateBill } = useBills()
  const [editingBill, setEditingBill] = useState<Bill | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const debts = useMemo(() => sortDebts(bills.filter((b) => b.active && b.is_debt)), [bills])
  const { snowball, avalanche } = useMemo(() => snowballOrder(bills), [bills])

  function openEditDialog(bill: Bill) {
    setEditingBill(bill)
    setDialogOpen(true)
  }

  async function handleSubmit(values: BillInsert) {
    if (editingBill) {
      await updateBill(editingBill.id, values)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Credit</h1>
        <p className="text-sm text-muted-foreground">Payoff math and utilization, done for you.</p>
      </div>

      {!loading && debts.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No credit cards or loans yet</CardTitle>
            <CardDescription>
              Mark a bill as a debt payment on the Bills page to see it here.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {debts.map((bill) => (
          <CreditAccountCard key={bill.id} bill={bill} onEdit={openEditDialog} />
        ))}
      </div>

      {snowball.length > 0 && <SnowballList snowball={snowball} avalanche={avalanche} />}

      <BillFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        bill={editingBill}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
