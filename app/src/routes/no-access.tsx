import { useState } from 'react'
import { Navigate, createFileRoute } from '@tanstack/react-router'
import { RoleLoadError, useAuth } from '#/auth'
import { landingPath, noAccessHeading, noAccessMessage } from '#/lib/auth'
import { isDemoMode } from '#/lib/supabase'
import { Card } from '#/components/ui'

export const Route = createFileRoute('/no-access')({
  component: NoAccessScreen,
})

function NoAccessScreen() {
  const { status, role, displayName, signOut, refreshRole } = useAuth()
  // Outcome of the last "Check again": null until one finishes.
  const [check, setCheck] = useState<'busy' | 'failed' | 'unchanged' | null>(null)

  if (isDemoMode) return <Navigate to="/" replace />
  if (status === 'signed-out') return <Navigate to="/login" replace />
  if (status === 'error') return <RoleLoadError />
  if (status === 'ready' && role.kind !== 'no-access') {
    return <Navigate to={landingPath(role)} replace />
  }

  const reason = role.kind === 'no-access' ? role.reason : 'no-profile'

  // A newly assigned disciple or a reactivated account gets in from here,
  // with no sign-out. A role that now grants access redirects above.
  const checkAgain = async () => {
    if (check === 'busy') return
    setCheck('busy')
    const loaded = await refreshRole()
    setCheck(loaded ? 'unchanged' : 'failed')
  }

  return (
    <div className="flex min-h-[calc(100vh-48px)] items-center justify-center bg-cream px-5 py-10">
      <Card className="w-full max-w-[420px] px-6 py-7 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cream-surface">
          <img src="/assets/logo-mark.png" alt="" className="h-8 w-8 rounded-full" />
        </div>
        <h1 className="mt-3.5 font-display text-[18px] font-bold text-ink">
          {noAccessHeading(reason, displayName)}
        </h1>
        <p className="mt-2 text-[12.5px] leading-relaxed font-medium text-ink/60">
          {noAccessMessage(reason)}
        </p>
        <button
          type="button"
          disabled={check === 'busy'}
          onClick={() => void checkAgain()}
          className="press mt-5 flex h-11 w-full cursor-pointer items-center justify-center rounded-full bg-brand text-[13px] font-bold text-white hover:bg-brand-press disabled:cursor-not-allowed disabled:bg-ink-300"
        >
          {check === 'busy' ? 'Checking…' : 'Check again'}
        </button>
        {check === 'failed' || check === 'unchanged' ? (
          <p
            role="status"
            className={`mt-2 text-[11.5px] font-bold ${check === 'failed' ? 'text-maroon' : 'text-ink/50'}`}
          >
            {check === 'failed' ? 'Connection failed. Retry.' : 'Access unchanged.'}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void signOut()}
          className="press mt-2.5 flex h-11 w-full cursor-pointer items-center justify-center rounded-full border-[1.5px] border-cream-border bg-white text-[13px] font-bold text-maroon"
        >
          Sign out
        </button>
      </Card>
    </div>
  )
}
