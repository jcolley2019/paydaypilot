import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Compass, CircleCheck, TriangleAlert } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

const RECOVERY_DETECT_TIMEOUT_MS = 3000

export function ResetPassword() {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()

  // null = still checking whether this page load came from a recovery link;
  // true = confirmed via the PASSWORD_RECOVERY auth event; false = timed out
  // without one, meaning the link is missing, invalid, or already used.
  const [isRecovery, setIsRecovery] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true)
      }
    })

    const timeout = window.setTimeout(() => {
      setIsRecovery((current) => current ?? false)
    }, RECOVERY_DETECT_TIMEOUT_MS)

    return () => {
      subscription.unsubscribe()
      window.clearTimeout(timeout)
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const { error } = await updatePassword(password)
    setSubmitting(false)
    if (error) {
      setError(
        error.toLowerCase().includes('session')
          ? 'This reset link has expired. Request a new one from the "Forgot password?" page.'
          : error,
      )
      return
    }
    setDone(true)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4 text-foreground">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <Compass className="size-8 text-primary" />
          <span className="text-xl font-semibold tracking-tight">PaydayPilot</span>
        </div>

        <Card className="w-full">
          {done ? (
            <CardContent className="flex flex-col items-center gap-3 py-4 text-center">
              <CircleCheck className="size-8 text-primary" />
              <CardTitle>Password updated</CardTitle>
              <CardDescription>You can now sign in with your new password.</CardDescription>
              <Button className="mt-2 w-full" onClick={() => navigate('/', { replace: true })}>
                Continue
              </Button>
            </CardContent>
          ) : isRecovery === false ? (
            <CardContent className="flex flex-col items-center gap-3 py-4 text-center">
              <TriangleAlert className="size-8 text-destructive" />
              <CardTitle>Invalid reset link</CardTitle>
              <CardDescription>
                This reset link is invalid or expired — request a new one.
              </CardDescription>
              <Button asChild className="mt-2 w-full">
                <Link to="/forgot-password">Request a new link</Link>
              </Button>
            </CardContent>
          ) : isRecovery === null ? (
            <CardContent className="flex flex-col items-center gap-3 py-4 text-center">
              <CardDescription>Verifying your reset link…</CardDescription>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Set a new password</CardTitle>
                <CardDescription>Choose a new password for your account.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="password" className="text-sm font-medium">
                      New password
                    </label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      disabled={submitting}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="confirm-password" className="text-sm font-medium">
                      Confirm new password
                    </label>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      disabled={submitting}
                    />
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button type="submit" disabled={submitting} className="mt-2 w-full">
                    {submitting ? 'Updating…' : 'Update password'}
                  </Button>
                </form>

                <p className="mt-4 text-center text-sm text-muted-foreground">
                  <Link to="/login" className="font-medium text-primary hover:underline">
                    Back to sign in
                  </Link>
                </p>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
