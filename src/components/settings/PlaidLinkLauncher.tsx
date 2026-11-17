// PP.9.2 — mounted only once a link token exists, so cdn.plaid.com is never loaded until
// the user clicks Connect / Reconnect. Opens Link as soon as it is ready; renders nothing.
import { useEffect, useRef } from 'react'
import { usePlaidLink } from 'react-plaid-link'

interface PlaidLinkLauncherProps {
  token: string
  onSuccess: (publicToken: string | null) => void
  onExit: () => void
  onLoadError: () => void
}

export function PlaidLinkLauncher({ token, onSuccess, onExit, onLoadError }: PlaidLinkLauncherProps) {
  const { open, ready, error } = usePlaidLink({
    token,
    onSuccess: (publicToken) => onSuccess(publicToken),
    onExit: () => onExit(),
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
