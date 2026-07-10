import {
  Link,
  Outlet,
  createRootRoute,
  useRouterState,
} from '@tanstack/react-router'
import { StoreProvider } from '#/store'
import { Toast } from '#/components/ui'

import '../styles.css'

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

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isAdmin = pathname.startsWith('/admin')
  return (
    <StoreProvider>
      <div className="sticky top-0 z-60 flex h-12 items-center justify-between bg-ink px-4">
        <div className="flex items-center gap-2">
          <img
            src="/assets/logo-mark.png"
            alt="Quest Laguna"
            className="block h-[22px] w-[22px] rounded-full"
          />
          <span className="font-display text-[13px] font-bold text-white">Agapay</span>
          <span
            className="text-[10px] font-semibold uppercase text-white/45"
            style={{ letterSpacing: '.1em' }}
          >
            prototype
          </span>
        </div>
        <div className="flex gap-1.5">
          <RoleButton to="/" active={!isAdmin}>
            Discipler
          </RoleButton>
          <RoleButton to="/admin" active={isAdmin}>
            Admin
          </RoleButton>
        </div>
      </div>
      <Outlet />
      <Toast />
    </StoreProvider>
  )
}
