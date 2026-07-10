import { Link, Outlet, createFileRoute, useRouterState } from '@tanstack/react-router'
import { Calendar, Home, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Sheets } from '#/components/sheets'

export const Route = createFileRoute('/_discipler')({
  component: DisciplerLayout,
})

function Tab({
  to,
  active,
  icon,
  label,
}: {
  to: string
  active: boolean
  icon: ReactNode
  label: string
}) {
  return (
    <Link
      to={to}
      className="flex cursor-pointer flex-col items-center gap-[3px] py-[5px]"
      style={{ color: active ? 'var(--color-brand)' : 'rgb(11 11 12 / .45)' }}
    >
      {icon}
      <span className="text-[9.5px] font-bold">{label}</span>
    </Link>
  )
}

function DisciplerLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return (
    <div className="relative mx-auto flex h-[calc(100vh-48px)] max-w-[430px] flex-col overflow-hidden bg-cream shadow-[0_0_48px_rgba(0,0,0,.10)]">
      <div className="flex flex-1 flex-col overflow-y-auto">
        <Outlet />
      </div>
      <div className="z-10 grid flex-none grid-cols-3 border-t border-cream-border bg-white px-2 pt-2 pb-3">
        <Tab
          to="/"
          active={pathname === '/'}
          icon={<Home size={21} strokeWidth={2.2} />}
          label="Home"
        />
        <Tab
          to="/disciples"
          active={pathname.startsWith('/disciples')}
          icon={<Users size={21} strokeWidth={2.2} />}
          label="Disciples"
        />
        <Tab
          to="/meetings"
          active={pathname.startsWith('/meetings')}
          icon={<Calendar size={21} strokeWidth={2.2} />}
          label="Meetings"
        />
      </div>
      <Sheets />
    </div>
  )
}
