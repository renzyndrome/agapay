import { Link, Outlet, createFileRoute, useRouterState } from '@tanstack/react-router'
import { LayoutDashboard, ListChecks, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { useStore } from '#/store'
import { AdminDiscipleModal } from '#/components/admin-disciple-modal'

export const Route = createFileRoute('/admin')({
  component: AdminLayout,
})

interface NavItemProps {
  to: string
  exact?: boolean
  icon: ReactNode
  label: string
}

function NavItem({ to, exact, icon, label }: NavItemProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const active = exact ? pathname === to : pathname.startsWith(to)
  return (
    <Link
      to={to}
      className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2.5"
      style={{
        background: active ? 'rgba(255,255,255,.08)' : 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,.55)',
        borderLeft: `3px solid ${active ? 'var(--color-brand)' : 'transparent'}`,
      }}
    >
      {icon}
      <span className="text-[12.5px] font-bold">{label}</span>
    </Link>
  )
}

function AdminLayout() {
  const { adminName } = useStore()
  return (
    <div className="flex min-h-[calc(100vh-48px)] bg-cream max-md:flex-col">
      {/* sidebar */}
      <aside className="flex w-54 flex-none flex-col bg-ink py-5 max-md:w-full max-md:flex-row max-md:items-center max-md:gap-2 max-md:px-4 max-md:py-2">
        <div className="flex items-center gap-2 border-b border-white/10 px-5 pb-5 max-md:border-b-0 max-md:p-0">
          <img
            src="/assets/logo-mark.png"
            alt="Quest Laguna"
            className="block h-7 w-7 rounded-full"
          />
          <div>
            <div className="font-display text-[14px] leading-[1.1] font-bold text-white">
              Agapay
            </div>
            <div
              className="text-[9.5px] font-semibold uppercase text-white/45"
              style={{ letterSpacing: '.1em' }}
            >
              Admin
            </div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-3 py-3.5 max-md:flex-1 max-md:flex-row max-md:p-0">
          <NavItem
            to="/admin"
            exact
            icon={<LayoutDashboard size={16} strokeWidth={2.2} />}
            label="Dashboard"
          />
          <NavItem
            to="/admin/disciples"
            icon={<Users size={16} strokeWidth={2.2} />}
            label="Disciples"
          />
          <NavItem
            to="/admin/checklists"
            icon={<ListChecks size={16} strokeWidth={2.2} />}
            label="Checklists"
          />
        </nav>
        <div className="mt-auto border-t border-white/10 px-5 pt-4 max-md:hidden">
          <div className="text-[11px] font-semibold text-white/55">{adminName}</div>
          <div
            className="mt-0.5 text-[9.5px] font-semibold uppercase text-white/35"
            style={{ letterSpacing: '.08em' }}
          >
            Quest Laguna leadership
          </div>
        </div>
      </aside>

      {/* main */}
      <main className="h-[calc(100vh-48px)] flex-1 overflow-y-auto max-md:h-auto">
        <Outlet />
      </main>

      <AdminDiscipleModal />
    </div>
  )
}
