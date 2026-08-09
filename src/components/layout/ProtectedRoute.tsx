import { useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'

interface ProtectedRouteProps {
  children: ReactNode
  requireOnboarded?: boolean
}

export function ProtectedRoute({ children, requireOnboarded = true }: ProtectedRouteProps) {
  const { session, profile, loading, profileError, refreshProfile } = useAuth()
  const location = useLocation()
  const [retrying, setRetrying] = useState(false)

  if (loading) {
    return <div className="min-h-svh bg-background" />
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (!profile) {
    async function handleRetry() {
      setRetrying(true)
      await refreshProfile()
      setRetrying(false)
    }

    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-4 text-center text-foreground">
        <p className="max-w-sm text-sm text-muted-foreground">
          {profileError
            ? "We couldn't load your profile. Check your connection and try again."
            : 'Loading your profile…'}
        </p>
        {profileError && (
          <Button onClick={handleRetry} disabled={retrying}>
            {retrying ? 'Retrying…' : 'Retry'}
          </Button>
        )}
      </div>
    )
  }

  if (requireOnboarded && !profile.onboarded) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}
