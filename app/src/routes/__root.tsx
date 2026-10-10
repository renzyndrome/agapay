import { useEffect, useState } from 'react'
import {
  Link,
  Outlet,
  createRootRoute,
  useRouterState,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '#/auth'
import { isDemoMode } from '#/lib/supabase'
import { StoreProvider } from '#/store'
import { Toast } from '#/components/ui'

import '../styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
})

export const Route = createRootRoute({
  component: RootComponent,
})

interface RoleButtonProps {
  to: string
  active: boolean
  children: string
}

function RoleButton({ to, active, children }: RoleButtonProps) {
  return (
    <Link
      to={to}
      className="cursor-pointer rounded-full px-3.5 py-[7px] text-[11px] font-bold text-white"
      style={{ background: active ? 'var(--color-brand)' : 'rgba(255,255,255,.1)' }}
    >
      {children}
    </Link>
  )
}

/** Demo: prototype role switcher. Live: who is signed in + sign out. */
function TopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { status, displayName, signOut } = useAuth()
  const isAdmin = pathname.startsWith('/admin')

  return (
    <div className="sticky top-0 z-60 flex h-12 items-center justify-between bg-ink px-4">
      <div className="flex items-center gap-2">
        <img
          src="/assets/logo-mark.png"
          alt="Quest Laguna"
          className="block h-[22px] w-[22px] rounded-full"
        />
        <span className="font-display text-[13px] font-bold text-white">Agapay</span>
        {isDemoMode ? (
          <span
            className="text-[10px] font-semibold uppercase text-white/45"
            style={{ letterSpacing: '.1em' }}
          >
            prototype
          </span>
        ) : null}
      </div>

      {isDemoMode ? (
        <div className="flex gap-1.5">
          <RoleButton to="/" active={!isAdmin}>
            Discipler
          </RoleButton>
          <RoleButton to="/admin" active={isAdmin}>
            Admin
          </RoleButton>
        </div>
      ) : status === 'ready' ? (
        <div className="flex items-center gap-3">
          <span className="max-w-[45vw] truncate text-[11.5px] font-semibold text-white/70">
            {displayName}
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="cursor-pointer rounded-full bg-white/10 px-3.5 py-[7px] text-[11px] font-bold text-white hover:bg-white/20"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** Honest offline state: the queue is only as fresh as the last sync. */
function OfflineBanner() {
  const [offline, setOffline] = useState(
    typeof navigator === 'undefined' ? false : !navigator.onLine,
  )
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  if (!offline) return null
  return (
    <div className="bg-amber-tint px-4 py-2 text-center text-[11.5px] font-bold text-amber-text">
      Offline. Showing last synced data.
    </div>
  )
}

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StoreProvider>
          <TopBar />
          <OfflineBanner />
          <Outlet />
          <Toast />
        </StoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
