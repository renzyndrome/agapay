import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Calendar, Check, Eye, Plus } from 'lucide-react'
import type { Disciple, Meeting } from '#/data/seed'
import { queueGroups, upcomingThisWeek } from '#/lib/derive'
import { fmtDow, fmtHeader, fmtTime12, fromISODate, initials, today } from '#/lib/format'
import { useStore } from '#/store'
import {
  AvatarDisc,
  Card,
  DateColumn,
  SectionHeading,
  StageBadge,
} from '#/components/ui'

export const Route = createFileRoute('/_discipler/')({
  component: HomeScreen,
})

const RING_CIRCUMFERENCE = 2 * Math.PI * 27 // r=27 → 169.6

function HomeScreen() {
  const { disciples, meetings, disciplers, currentDisciplerId, openSheet } = useStore()
  const navigate = useNavigate()
  const me = disciplers.find((d) => d.id === currentDisciplerId)
  const mine = disciples.filter((d) => d.disciplerId === currentDisciplerId)
  const { quiet, cooling, steady, queueCount, ringFraction } = queueGroups(mine)
  const week = upcomingThisWeek(meetings)
  const done = mine.length - queueCount

  const openProfile = (id: string) =>
    navigate({ to: '/disciples/$id', params: { id } })

  return (
    <div className="flex min-h-full flex-col">
      {/* header */}
      <header className="flex-none border-b border-cream-border bg-white px-5 pt-4.5 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/assets/logo-mark.png"
              alt="Quest Laguna"
              className="block h-[26px] w-[26px] rounded-full"
            />
            <span className="font-display text-[15px] font-bold text-ink">Agapay</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-ink/50">
              {fmtHeader(today())}
            </span>
            <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-cream-border bg-cream-surface font-display text-[12px] font-bold text-maroon">
              {initials(me?.name ?? '')}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <div className="relative h-16 w-16 flex-none">
            <svg width="64" height="64" viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r="27"
                fill="none"
                stroke="var(--color-cream-surface)"
                strokeWidth="7"
              />
              <circle
                cx="32"
                cy="32"
                r="27"
                fill="none"
                stroke="var(--color-brand)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${Math.max(4, Math.round(ringFraction * RING_CIRCUMFERENCE))} ${RING_CIRCUMFERENCE.toFixed(1)}`}
                transform="rotate(-90 32 32)"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-display text-[20px] font-extrabold text-ink">
              {queueCount}
            </div>
          </div>
          <div className="flex-1">
            <div className="font-display text-[17px] font-bold tracking-[-.01em] text-ink">
              {queueCount === 0
                ? 'All caught up!'
                : `${queueCount} check-in${queueCount === 1 ? '' : 's'} to go`}
            </div>
            <div className="mt-0.5 text-[12px] font-medium text-ink/55">
              {queueCount === 0
                ? 'Every disciple has been walked with recently.'
                : `You've checked in with ${done} of ${mine.length} disciples recently. Keep going!`}
            </div>
          </div>
        </div>
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-cream-surface px-2.5 py-[5px] text-[10.5px] font-bold text-ink-700">
            {mine.length} disciples
          </span>
          <span className="rounded-full bg-rose px-2.5 py-[5px] text-[10.5px] font-bold text-maroon">
            {quiet.length} at-risk
          </span>
          <span className="rounded-full bg-cream-surface px-2.5 py-[5px] text-[10.5px] font-bold text-ink-700">
            {week.length} meetings this week
          </span>
        </div>
      </header>

      {/* queue: quiet */}
      {quiet.length > 0 && (
        <section className="px-5 pt-5">
          <SectionHeading dotColor="var(--color-brand)" color="var(--color-maroon)">
            Quiet for a while
          </SectionHeading>
          {quiet.map((d) => (
            <QuietCard
              key={d.id}
              disciple={d}
              onView={() => openProfile(d.id)}
              onLog={() => openSheet({ kind: 'log', discipleId: d.id })}
              onSchedule={() => openSheet({ kind: 'sched', discipleId: d.id })}
            />
          ))}
        </section>
      )}

      {/* queue: cooling */}
      {cooling.length > 0 && (
        <section className="px-5 pt-5">
          <SectionHeading
            dotColor="var(--color-amber)"
            color="var(--color-amber-text)"
          >
            Cooling down
          </SectionHeading>
          <Card className="mt-2.5">
            {cooling.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 border-b border-cream-surface px-4 py-3 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => openProfile(d.id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                >
                  <AvatarDisc name={d.name} stage={d.stage} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[14px] font-bold text-ink">
                      {d.name}
                    </div>
                    <div className="text-[11.5px] font-medium text-ink/55">
                      {d.stage} · {d.days} days since last activity
                    </div>
                  </div>
                </button>
                <div className="flex flex-none gap-1.5">
                  <RoundIconButton
                    label={`Log activity for ${d.name}`}
                    onClick={() => openSheet({ kind: 'log', discipleId: d.id })}
                  >
                    <Plus size={15} strokeWidth={2.4} />
                  </RoundIconButton>
                  <RoundIconButton
                    label={`Schedule meeting with ${d.name}`}
                    onClick={() => openSheet({ kind: 'sched', discipleId: d.id })}
                  >
                    <Calendar size={15} strokeWidth={2.2} />
                  </RoundIconButton>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* cleared celebration */}
      {queueCount === 0 && (
        <section className="px-5 pt-5">
          <Card className="px-5 py-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-tint">
              <Check size={26} strokeWidth={2.6} className="text-green" />
            </div>
            <div className="mt-3 font-display text-[17px] font-bold text-ink">
              All caught up!
            </div>
            <div className="mt-1 text-[12.5px] leading-relaxed font-medium text-ink/55">
              Every disciple has been walked with recently. No one left behind.
            </div>
          </Card>
        </section>
      )}

      {/* steady walkers */}
      {steady.length > 0 && (
        <section className="px-5 pt-5">
          <SectionHeading
            dotColor="var(--color-green)"
            color="var(--color-green)"
            right={
              <span className="text-[11px] font-semibold text-ink/40">
                {steady.length} disciples
              </span>
            }
          >
            Walking steady
          </SectionHeading>
          <div className="mt-2.5 flex pl-1">
            {steady.map((d, i) => (
              <button
                key={d.id}
                type="button"
                title={d.name}
                onClick={() => openProfile(d.id)}
                className="flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-full border-2 border-cream bg-green-tint font-display text-[12px] font-bold text-green"
                style={{ marginLeft: i === 0 ? 0 : -8 }}
              >
                {initials(d.name)}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* this week */}
      <div className="flex items-baseline justify-between px-5 pt-5.5 pb-2.5">
        <span className="section-label text-maroon">This week</span>
        <Link to="/meetings" className="text-[11px] font-bold text-brand">
          See all
        </Link>
      </div>
      <div className="flex flex-col gap-2 px-5 pb-5">
        {week.length === 0 ? (
          <Card className="px-4 py-4 text-center text-[12px] font-medium text-ink/50">
            No meetings this week — schedule one from a disciple&rsquo;s profile.
          </Card>
        ) : (
          week.map((m) => <WeekRow key={m.id} meeting={m} />)
        )}
      </div>

      {/* scripture footer */}
      <footer className="mt-auto px-5.5 pt-2.5 pb-5 text-center">
        <div className="text-[12px] leading-relaxed font-medium text-ink/55 italic">
          &ldquo;And let us consider how we may spur one another on toward love and
          good deeds.&rdquo;
        </div>
        <div
          className="mt-1 text-[10px] font-bold text-brand"
          style={{ letterSpacing: '.12em' }}
        >
          — HEBREWS 10:24
        </div>
      </footer>
    </div>
  )
}

interface QuietCardProps {
  disciple: Disciple
  onView: () => void
  onLog: () => void
  onSchedule: () => void
}

function QuietCard({ disciple: d, onView, onLog, onSchedule }: QuietCardProps) {
  return (
    <Card className="mt-2.5">
      <button
        type="button"
        onClick={onView}
        className="flex w-full cursor-pointer gap-3 px-4 py-3.5 text-left"
      >
        <AvatarDisc name={d.name} stage={d.stage} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-display text-[15px] font-bold text-ink">
              {d.name}
            </span>
            <StageBadge stage={d.stage} />
          </div>
          <div className="mt-1 text-[12px] leading-normal font-medium text-ink/60">
            No activity in {d.days} days. Last seen: {d.lastSeen}. A quick check-in
            goes a long way.
          </div>
        </div>
      </button>
      <div className="grid grid-cols-3 border-t border-cream-surface">
        <FooterAction onClick={onView} icon={<Eye size={13} strokeWidth={2.2} />}>
          View
        </FooterAction>
        <FooterAction onClick={onLog} icon={<Plus size={13} strokeWidth={2.4} />}>
          Log
        </FooterAction>
        <FooterAction
          onClick={onSchedule}
          icon={<Calendar size={13} strokeWidth={2.2} />}
          last
        >
          Schedule
        </FooterAction>
      </div>
    </Card>
  )
}

interface FooterActionProps {
  onClick: () => void
  icon: React.ReactNode
  children: string
  last?: boolean
}

function FooterAction({ onClick, icon, children, last }: FooterActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 cursor-pointer items-center justify-center gap-[5px] text-[11.5px] font-bold text-maroon ${last ? '' : 'border-r border-cream-surface'}`}
    >
      {icon}
      {children}
    </button>
  )
}

interface RoundIconButtonProps {
  label: string
  onClick: () => void
  children: React.ReactNode
}

function RoundIconButton({ label, onClick, children }: RoundIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="press flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-cream-border bg-cream text-maroon"
    >
      {children}
    </button>
  )
}

function WeekRow({ meeting: m }: { meeting: Meeting }) {
  const { disciples } = useStore()
  const d = disciples.find((x) => x.id === m.discipleId)
  const date = fromISODate(m.dateISO)
  return (
    <Link to="/meetings" className="cursor-pointer">
      <Card className="flex items-center gap-3 rounded-[14px] px-3.5 py-[11px]">
        <DateColumn dow={fmtDow(date)} day={String(date.getDate())} />
        <div className="w-px self-stretch bg-cream-border" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[13px] font-bold text-ink">
            {d?.name ?? ''}
          </div>
          <div className="text-[11.5px] font-medium text-ink/55">
            {fmtTime12(m.time)} · {m.place}
          </div>
        </div>
        <span className="flex-none rounded-full bg-cream-surface px-2.5 py-1 text-[10px] font-bold text-ink-700">
          {m.mode === 'online' ? 'Online' : 'In-person'}
        </span>
      </Card>
    </Link>
  )
}
