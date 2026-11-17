// PP.9.2 — the "Bank connections" section on Settings (approved layout). Presentational:
// every value and action comes in through props, so it renders the same from usePlaid or
// from fixture data.
import { Landmark, LoaderCircle, Plus, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  accountRowLabel,
  formatBalance,
  latestSync,
  syncedLabel,
  transactionsImportedLabel,
} from '@/lib/plaidConnect'
import type { PlaidBusy } from '@/hooks/usePlaid'
import type { PlaidAccountRow, PlaidItem } from '@/types/plaid'

interface BankConnectionsSectionProps {
  items: PlaidItem[]
  accounts: PlaidAccountRow[]
  transactionCount: number
  loading: boolean
  busy: PlaidBusy
  /** A sync is running somewhere (manual or background). */
  syncRunning: boolean
  now: Date
  onConnect: () => void
  onReconnect: (itemId: string) => void
  onSync: () => void
}

function BankBlock({
  item,
  accounts,
  disabled,
  onReconnect,
}: {
  item: PlaidItem
  accounts: PlaidAccountRow[]
  disabled: boolean
  onReconnect: (itemId: string) => void
}) {
  const needsSignIn = item.status === 'login_required'
  const name = item.institution_name ?? 'Bank'
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Landmark className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 truncate font-medium">{name}</span>
        </div>
        <Badge
          variant="outline"
          className={cn(needsSignIn && 'border-primary/50 text-primary')}
        >
          {needsSignIn ? 'Needs sign-in' : 'Connected'}
        </Badge>
      </div>

      {accounts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">
                {accountRowLabel(account.name, account.mask)}
              </span>
              <span className="pp-money shrink-0">{formatBalance(account.balance)}</span>
            </li>
          ))}
        </ul>
      )}

      {needsSignIn && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={disabled}
          onClick={() => onReconnect(item.id)}
        >
          Reconnect
        </Button>
      )}
    </div>
  )
}

export function BankConnectionsSection({
  items,
  accounts,
  transactionCount,
  loading,
  busy,
  syncRunning,
  now,
  onConnect,
  onReconnect,
  onSync,
}: BankConnectionsSectionProps) {
  const connected = items.length > 0
  const disabled = busy !== 'idle'
  const connecting = busy === 'opening' || busy === 'connecting'
  const syncing = busy === 'syncing' || syncRunning

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Bank connections</h2>
        {connected && (
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {syncing ? 'Syncing…' : syncedLabel(latestSync(items), now)}
          </span>
        )}
      </div>

      {!loading && !connected && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm">Connect a bank and bills mark themselves paid when the charge shows up.</p>
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              <Landmark className="size-6" aria-hidden />
              No banks connected yet.
            </div>
            <Button type="button" className="w-full" disabled={disabled} onClick={onConnect}>
              {connecting ? <LoaderCircle className="animate-spin" /> : <Plus />}
              {busy === 'connecting' ? 'Connecting your bank…' : 'Connect a bank'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Sign-in happens on your bank's own page through Plaid. PaydayPilot never sees your password.
            </p>
          </CardContent>
        </Card>
      )}

      {connected && (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <BankBlock
              key={item.id}
              item={item}
              accounts={accounts.filter((account) => account.plaid_item_id === item.id)}
              disabled={disabled}
              onReconnect={onReconnect}
            />
          ))}

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" disabled={disabled || syncRunning} onClick={onSync}>
              <RefreshCw className={cn(syncing && 'animate-spin')} />
              {syncing ? 'Syncing…' : 'Sync now'}
            </Button>
            <Button type="button" variant="outline" disabled={disabled} onClick={onConnect}>
              {connecting ? <LoaderCircle className="animate-spin" /> : <Plus />}
              {busy === 'connecting' ? 'Connecting…' : 'Add another bank'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{transactionsImportedLabel(transactionCount)}</p>
        </div>
      )}
    </section>
  )
}
