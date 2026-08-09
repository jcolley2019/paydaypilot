import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Compass, CircleCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export function ResetPassword() {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

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
