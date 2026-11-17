// PP.9.3 — where Plaid sends the browser back after bank-website (OAuth) sign-in.
// Re-opens Link with the saved link token and the full return URL, finishes exactly like a
// connect / reconnect on Settings (same calls through the sync queue, same toasts), then
// goes to /settings. No nav entry; reached only by Plaid's redirect.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PlaidLinkLauncher } from '@/components/settings/PlaidLinkLauncher'
import { usePlaid } from '@/hooks/usePlaid'
import {
  PLAID_OAUTH_EXPIRED_MESSAGE,
  browserStorage,
  clearPlaidOAuthResume,
  isPlaidOAuthReturn,
  readPlaidOAuthResume,
} from '@/lib/plaidOAuth'
import { PLAID_GENERIC_MESSAGE } from '@/lib/plaidConnect'

export function PlaidOAuth() {
  const navigate = useNavigate()
  const { completeLink } = usePlaid()
  // Read once: the saved session and the URL exactly as Plaid returned it.
  const [receivedRedirectUri] = useState(() => window.location.href)
  const [resume] = useState(() => readPlaidOAuthResume(browserStorage(), Date.now()))
  const session = resume.status === 'ready' && isPlaidOAuthReturn(receivedRedirectUri) ? resume.session : null
  const done = useRef(false)

  function finish(message?: string) {
    if (done.current) return
    done.current = true
    clearPlaidOAuthResume(browserStorage())
    if (message) toast.error(message)
    navigate('/settings', { replace: true })
  }

  useEffect(() => {
    if (!session) finish(PLAID_OAUTH_EXPIRED_MESSAGE)
    // Runs once on arrival; finish() guards against a second run.
  }, [])

  async function handleSuccess(publicToken: string | null) {
    if (!session || done.current) return
    await completeLink(session, publicToken)
    finish()
  }

  function handleExit(errorCode: string | null) {
    finish(errorCode === 'INVALID_LINK_TOKEN' ? PLAID_OAUTH_EXPIRED_MESSAGE : undefined)
  }

  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="max-w-sm text-sm text-muted-foreground">Finishing bank sign-in…</p>
      {session && (
        <PlaidLinkLauncher
          token={session.token}
          receivedRedirectUri={receivedRedirectUri}
          onSuccess={handleSuccess}
          onExit={handleExit}
          onLoadError={() => finish(PLAID_GENERIC_MESSAGE)}
        />
      )}
    </div>
  )
}
