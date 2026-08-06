import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIncomeSources } from '@/hooks/useIncomeSources'
import { useTheme } from '@/hooks/useTheme'
import { IncomeSourceCard } from '@/components/income/IncomeSourceCard'
import { IncomeSourceFormDialog } from '@/components/income/IncomeSourceFormDialog'
import type { IncomeSource, IncomeSourceInsert } from '@/types/payday'
import type { Theme } from '@/lib/theme'

export function Settings() {
  const {
    incomeSources,
    loading,
    createIncomeSource,
    updateIncomeSource,
    deleteIncomeSource,
    addManualPaycheck,
  } = useIncomeSources()
  const { theme, setTheme } = useTheme()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSource, setEditingSource] = useState<IncomeSource | null>(null)

  function openAddDialog() {
    setEditingSource(null)
    setDialogOpen(true)
  }

  function openEditDialog(source: IncomeSource) {
    setEditingSource(source)
    setDialogOpen(true)
  }

  async function handleSubmit(values: IncomeSourceInsert) {
    if (editingSource) {
      await updateIncomeSource(editingSource.id, values)
    } else {
      await createIncomeSource(values)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your account and payday plan.</p>
        </div>
        <Button type="button" variant="outline" asChild>
          <Link to="/onboarding">Re-run setup</Link>
        </Button>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Income</h2>
            <p className="text-sm text-muted-foreground">
              Add each paycheck source so PaydayPilot can build your plan.
            </p>
          </div>
          <Button type="button" onClick={openAddDialog}>
            <Plus className="size-4" />
            Add income
          </Button>
        </div>

        {!loading && incomeSources.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No income sources yet</CardTitle>
              <CardDescription>Add your paycheck to see your payday plan.</CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="flex flex-col gap-3">
          {incomeSources.map((source) => (
            <IncomeSourceCard
              key={source.id}
              source={source}
              onEdit={openEditDialog}
              onDelete={deleteIncomeSource}
              onAddManualPaycheck={addManualPaycheck}
            />
          ))}
        </div>

        <IncomeSourceFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          source={editingSource}
          onSubmit={handleSubmit}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Appearance</h2>
          <p className="text-sm text-muted-foreground">Choose how PaydayPilot looks on this device.</p>
        </div>

        <Tabs value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <TabsList>
            <TabsTrigger value="dark">Dark</TabsTrigger>
            <TabsTrigger value="paper">Paper</TabsTrigger>
          </TabsList>
        </Tabs>
      </section>
    </div>
  )
}
