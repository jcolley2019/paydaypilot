import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Compass, MailCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export function ForgotPassword() {
  const { resetPasswordForEmail } = useAuth()

  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await resetPasswordForEmail(email)
    setSubmitting(false)
    if (error) {
      setError(error)
      return
    }
    setSent(true)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4 text-foreground">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <Compass className="size-8 text-primary" />
          <span className="text-xl font-semibold tracking-tight">PaydayPilot</span>
        </div>

        <Card className="w-full">
          {sent ? (
            <CardContent className="flex flex-col items-center gap-3 py-4 text-center">
              <MailCheck className="size-8 text-primary" />
              <CardTitle>Check your email</CardTitle>
              <CardDescription>
                If an account exists for <span className="font-medium">{email}</span>, we sent a
                link to reset your password.
              </CardDescription>
              <Button asChild className="mt-2 w-full">
                <Link to="/login">Back to sign in</Link>
              </Button>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Reset your password</CardTitle>
                <CardDescription>
                  Enter your email and we'll send you a link to reset it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="email" className="text-sm font-medium">
                      Email
                    </label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={submitting}
                    />
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button type="submit" disabled={submitting} className="mt-2 w-full">
                    {submitting ? 'Sending…' : 'Send reset link'}
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
