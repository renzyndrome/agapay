import { useState } from 'react'
import { Navigate, createFileRoute } from '@tanstack/react-router'
import { RoleLoadError, useAuth } from '#/auth'
import { landingPath } from '#/lib/auth'
import { isDemoMode } from '#/lib/supabase'
import { Card, FieldLabel, inputClass } from '#/components/ui'

export const Route = createFileRoute('/login')({
  component: LoginScreen,
})

function LoginScreen() {
  const { status, role, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // The seeded prototype has no login; the role switcher stands in for it.
  if (isDemoMode) return <Navigate to="/" replace />
  if (status === 'ready') return <Navigate to={landingPath(role)} replace />
  if (status === 'error') return <RoleLoadError />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const { error: signInError } = await signIn(email.trim(), password)
    if (signInError) setError(signInError)
    setBusy(false)
  }

  return (
    <div className="flex min-h-[calc(100vh-48px)] items-center justify-center bg-cream px-5 py-10">
      <div className="w-full max-w-[380px]">
        <div className="flex flex-col items-center text-center">
          <img
            src="/assets/logo-mark.png"
            alt="Quest Laguna"
            className="h-12 w-12 rounded-full"
          />
          <h1 className="mt-3 font-display text-[22px] font-bold tracking-[-.01em] text-ink">
            Agapay
          </h1>
          <p className="mt-1 text-[12.5px] leading-relaxed font-medium text-ink/55">
            No one left behind.
          </p>
        </div>

        <Card className="mt-5 px-5 py-5">
          <form onSubmit={submit} noValidate>
            <FieldLabel>Email</FieldLabel>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@questlaguna.org"
              className={inputClass}
            />
            <div className="mt-3">
              <FieldLabel>Password</FieldLabel>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className={inputClass}
              />
            </div>

            {error ? (
              <div
                role="alert"
                className="mt-3 rounded-(--radius-input) bg-rose px-3 py-2.5 text-[12px] font-semibold text-maroon"
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="press mt-4 flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-brand text-[14px] font-bold text-white shadow-(--shadow-glow) hover:bg-brand-press disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </Card>

        <p className="mt-4 text-center text-[11.5px] leading-relaxed font-medium text-ink/45">
          Quest Laguna invitation account only. No invitation: contact a church
          leader.
        </p>
      </div>
    </div>
  )
}
