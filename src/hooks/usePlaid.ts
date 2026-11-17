// PP.9.2 — bank connections for Settings: data, connect, reconnect, manual sync.
// Plaid Link itself is opened by <PlaidLinkLauncher> from the linkSession this hook sets,
// so the Plaid script only loads after a button click.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PLAID_GENERIC_MESSAGE, plaidErrorMessage } from '@/lib/plaidConnect'
import {
  browserStorage,
  clearPlaidOAuthResume,
  savePlaidOAuthResume,
  type PlaidOAuthSession,
} from '@/lib/plaidOAuth'
import {
  PlaidCallError,
  backgroundSyncCount,
  createLinkToken,
  exchangePublicToken,
  isPlaidSyncing,
  subscribePlaidSync,
  syncAllItems,
  syncOneItem,
} from '@/lib/plaidSync'
import type { PlaidAccountRow, PlaidItem, PlaidSyncResponse } from '@/types/plaid'

/** What the section is waiting on, if anything. */
export type PlaidBusy = 'idle' | 'opening' | 'connecting' | 'syncing'

/** A Link session waiting to open: a new connection, or update mode for one bank. */
export type PlaidLinkSession = PlaidOAuthSession

function toastPlaidError(err: unknown) {
  if (err instanceof PlaidCallError) {
    toast.error(plaidErrorMessage(err.status, err.code))
  } else {
    toast.error(PLAID_GENERIC_MESSAGE)
  }
  console.warn('plaid call failed', err)
}

/** Manual sync / reconnect outcome in plain words; silent when every bank synced. */
function reportSyncResult(result: PlaidSyncResponse) {
  const needsSignIn = result.items.filter((item) => item.status === 'login_required')
  const failed = result.items.filter((item) => item.status === 'error')
  if (needsSignIn.length > 0) {
    const names = needsSignIn.map((item) => item.institution_name ?? 'Your bank').join(', ')
    toast.error(`${names} needs you to sign in again.`)
  } else if (failed.length > 0) {
    toast.error(PLAID_GENERIC_MESSAGE)
  }
}

export function usePlaid() {
  const { user } = useAuth()
  const [items, setItems] = useState<PlaidItem[]>([])
  const [accounts, setAccounts] = useState<PlaidAccountRow[]>([])
  const [transactionCount, setTransactionCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<PlaidBusy>('idle')
  const [linkSession, setLinkSession] = useState<PlaidLinkSession | null>(null)

  const syncRunning = useSyncExternalStore(subscribePlaidSync, isPlaidSyncing)
  const backgroundSyncs = useSyncExternalStore(subscribePlaidSync, backgroundSyncCount)

  const fetchAll = useCallback(async () => {
    if (!user) {
      setItems([])
      setAccounts([])
      setTransactionCount(0)
      setLoading(false)
      return
    }
    const [itemRes, accountRes, txRes] = await Promise.all([
      supabase
        .from('plaid_items')
        .select('id, institution_name, status, error_code, last_synced_at, created_at')
        .eq('user_id', user.id)
        .neq('status', 'removed')
        .order('created_at', { ascending: true }),
      supabase
        .from('accounts')
        .select('id, name, mask, type, subtype, plaid_item_id, balance, available_balance')
        .eq('user_id', user.id)
        .eq('source', 'plaid')
        .order('created_at', { ascending: true }),
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('source', 'plaid'),
    ])
    const error = itemRes.error ?? accountRes.error ?? txRes.error
    if (error) {
      toast.error(`Failed to load bank connections: ${error.message}`)
    } else {
      setItems((itemRes.data ?? []) as PlaidItem[])
      setAccounts((accountRes.data ?? []) as PlaidAccountRow[])
      setTransactionCount(txRes.count ?? 0)
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // An auto-sync finished while Settings was open: show the fresh data.
  useEffect(() => {
    if (backgroundSyncs > 0) fetchAll()
  }, [backgroundSyncs, fetchAll])

  async function openLink(itemId?: string) {
    if (busy !== 'idle') return
    setBusy('opening')
    try {
      const token = await createLinkToken(itemId)
      const session: PlaidLinkSession = itemId ? { token, mode: 'update', itemId } : { token, mode: 'new' }
      // PP.9.3 — kept so /plaid-oauth can resume if the bank's sign-in redirects the browser away.
      savePlaidOAuthResume(browserStorage(), session, Date.now())
      setLinkSession(session)
      // busy stays 'opening' until Link reports success or exit.
    } catch (err) {
      toastPlaidError(err)
      setBusy('idle')
    }
  }

  const connect = () => openLink()
  const reconnect = (itemId: string) => openLink(itemId)

  /**
   * Finishes a Link session (here, or resumed on /plaid-oauth). In update mode the public
   * token is not exchanged — the bank is re-synced. Both calls go through the sync queue.
   */
  async function completeLink(session: PlaidLinkSession, publicToken: string | null) {
    clearPlaidOAuthResume(browserStorage())
    try {
      if (session.mode === 'update' && session.itemId) {
        setBusy('syncing')
        const result = await syncOneItem(session.itemId)
        await fetchAll()
        reportSyncResult(result)
      } else {
        if (!publicToken) throw new PlaidCallError('Link returned no public token', null, null)
        setBusy('connecting')
        const result = await exchangePublicToken(publicToken)
        await fetchAll()
        toast.success(`Connected ${result.item.institution_name ?? 'your bank'}`)
      }
    } catch (err) {
      toastPlaidError(err)
      await fetchAll()
    } finally {
      setBusy('idle')
    }
  }

  /** Link finished. */
  async function handleLinkSuccess(publicToken: string | null) {
    const session = linkSession
    setLinkSession(null)
    if (!session) {
      clearPlaidOAuthResume(browserStorage())
      setBusy('idle')
      return
    }
    await completeLink(session, publicToken)
  }

  /** The user closed Link (or Link ended on its own error screen): not an error, no toast. */
  function handleLinkExit() {
    clearPlaidOAuthResume(browserStorage())
    setLinkSession(null)
    setBusy('idle')
  }

  /** The Plaid script could not load. */
  function handleLinkLoadError() {
    clearPlaidOAuthResume(browserStorage())
    setLinkSession(null)
    setBusy('idle')
    toast.error(PLAID_GENERIC_MESSAGE)
  }

  async function sync() {
    if (busy !== 'idle') return
    setBusy('syncing')
    try {
      const result = await syncAllItems()
      await fetchAll()
      reportSyncResult(result)
    } catch (err) {
      toastPlaidError(err)
    } finally {
      setBusy('idle')
    }
  }

  return {
    items,
    accounts,
    transactionCount,
    loading,
    busy,
    /** True while any sync runs, including a background auto-sync. */
    syncRunning,
    linkSession,
    connect,
    reconnect,
    sync,
    completeLink,
    handleLinkSuccess,
    handleLinkExit,
    handleLinkLoadError,
  }
}
