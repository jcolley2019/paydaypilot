// PP.9.2 — mounted only once a link token exists, so cdn.plaid.com is never loaded until
// the user clicks Connect / Reconnect. Opens Link as soon as it is ready; renders nothing.
// PP.9.3 — /plaid-oauth passes receivedRedirectUri to resume after bank-website sign-in.
import { useEffect, useRef } from 'react'
import { usePlaidLink } from 'react-plaid-link'

interface PlaidLinkLauncherProps {
  token: string
  /** The full URL Plaid sent the browser back to (OAuth resume only). */
  receivedRedirectUri?: string
  onSuccess: (publicToken: string | null) => void
  /** errorCode is Plaid's error_code when Link ended on an error, else null. */
  onExit: (errorCode: string | null) => void
  onLoadError: () => void
}

export function PlaidLinkLauncher({ token, receivedRedirectUri, onSuccess, onExit, onLoadError }: PlaidLinkLauncherProps) {
  const { open, ready, error } = usePlaidLink({
    token,
    receivedRedirectUri,
    onSuccess: (publicToken) => onSuccess(publicToken),
    onExit: (err) => onExit(err?.error_code ?? null),
  })
  const opened = useRef(false)

  useEffect(() => {
    if (ready && !opened.current) {
      opened.current = true
      open()
    }
  }, [ready, open])

  useEffect(() => {
    if (error) onLoadError()
  }, [error, onLoadError])

  return null
}
