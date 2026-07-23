import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

interface ProtectedRouteProps {
  children: ReactNode
  requireOnboarded?: boolean
}

export function ProtectedRoute({ children, requireOnboarded = true }: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="min-h-svh bg-background" />
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (requireOnboarded && profile && !profile.onboarded) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}
