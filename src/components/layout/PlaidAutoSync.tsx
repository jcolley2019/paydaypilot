// PP.9.2 — background bank sync. Lives in the signed-in shell: checks once when the app
// opens and again whenever it comes back to the foreground (a phone PWA can stay open for
// days). autoSyncIfDue only calls Plaid when an active bank is more than 15 minutes stale,
// never runs two syncs at once, and never blocks rendering. Renders nothing.
import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { autoSyncIfDue } from '@/lib/plaidSync'

export function PlaidAutoSync() {
  const { user } = useAuth()
  const userId = user?.id

  useEffect(() => {
    if (!userId) return
    const check = () => {
      if (document.visibilityState === 'visible') void autoSyncIfDue(userId)
    }
    check()
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [userId])

  return null
}
