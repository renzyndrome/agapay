import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Check, Clock, Plus, X } from 'lucide-react'
import type { Meeting } from '#/data/seed'
import { MEETING_STATUS_CHIP } from '#/lib/derive'
import { fmtDow, fmtShort, fmtTime12, fromISODate } from '#/lib/format'
import { useStore } from '#/store'
import { Card, DateColumn } from '#/components/ui'

export const Route = createFileRoute('/_discipler/meetings')({
  component: MeetingsScreen,
})

type MeetTab = 'upcoming' | 'past'

function MeetingsScreen() {
  const { meetings, openSheet } = useStore()
  const [tab, setTab] = useState<MeetTab>('upcoming')
  const upcoming = meetings
    .filter((m) => m.status === 'upcoming')
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO))
  const past = meetings
    .filter((m) => m.status !== 'upcoming')
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO))

  const tabStyle = (active: boolean) => ({
    background: active ? 'var(--color-ink)' : 'var(--color-white)',
    color: active ? '#fff' : 'var(--color-ink-700)',
  })

  return (
    <div>
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <span className="font-display text-[20px] font-bold tracking-[-.01em] text-ink">
          Meetings
        </span>
        <button
          type="button"
          onClick={() => openSheet({ kind: 'sched', discipleId: null })}
          className="press flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-brand px-3.5 text-[12px] font-bold text-white hover:bg-brand-press"
        >
          <Plus size={13} strokeWidth={2.4} /> New
        </button>
      </div>
      <div className="flex gap-1.5 px-5 pb-3.5">
        {(['upcoming', 'past'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="cursor-pointer rounded-full border-[1.5px] border-cream-border px-4 py-2 text-[11.5px] font-bold capitalize"
            style={tabStyle(tab === t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'upcoming' ? (
        <div className="flex flex-col gap-2 px-5 pb-5">
          {upcoming.length === 0 ? (
            <Card className="px-4 py-5 text-center text-[12px] font-medium text-ink/50">
              Nothing scheduled yet. Tap New to plan a check-in.
            </Card>
          ) : (
            upcoming.map((m) => <UpcomingCard key={m.id} meeting={m} />)
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-5 pb-5">
          {past.length === 0 ? (
            <Card className="px-4 py-5 text-center text-[12px] font-medium text-ink/50">
              Past meetings will show up here.
            </Card>
          ) : (
            past.map((m) => <PastRow key={m.id} meeting={m} />)
          )}
        </div>
      )}
    </div>
  )
}

function UpcomingCard({ meeting: m }: { meeting: Meeting }) {
  const { disciples, openSheet, cancelMeeting, noshowMeeting } = useStore()
  const d = disciples.find((x) => x.id === m.discipleId)
  const date = fromISODate(m.dateISO)
  return (
    <Card className="rounded-[14px]">
      <div className="flex items-center gap-3 px-3.5 py-3">
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
      </div>
      <div className="grid grid-cols-3 border-t border-cream-surface">
        <button
          type="button"
          onClick={() => openSheet({ kind: 'outcome', meetingId: m.id })}
          className="flex h-[42px] cursor-pointer items-center justify-center gap-[5px] border-r border-cream-surface text-[11.5px] font-bold text-green"
        >
          <Check size={13} strokeWidth={2.6} /> Done
        </button>
        <button
          type="button"
          onClick={() => cancelMeeting(m.id)}
          className="flex h-[42px] cursor-pointer items-center justify-center gap-[5px] border-r border-cream-surface text-[11.5px] font-bold text-ink/55"
        >
          <X size={12} strokeWidth={2.4} /> Cancel
        </button>
        <button
          type="button"
          onClick={() => noshowMeeting(m.id)}
          className="flex h-[42px] cursor-pointer items-center justify-center gap-[5px] text-[11.5px] font-bold text-amber-text"
        >
          <Clock size={13} strokeWidth={2.2} /> No-show
        </button>
      </div>
    </Card>
  )
}

function PastRow({ meeting: m }: { meeting: Meeting }) {
  const { disciples } = useStore()
  const d = disciples.find((x) => x.id === m.discipleId)
  const date = fromISODate(m.dateISO)
  const chip = MEETING_STATUS_CHIP[m.status]
  return (
    <Card className="flex items-center gap-3 rounded-[14px] px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[13px] font-bold text-ink">
          {d?.name ?? ''}
        </div>
        <div className="text-[11.5px] font-medium text-ink/55">
          {fmtShort(date)} · {fmtTime12(m.time)} · {m.place}
        </div>
        {m.note ? (
          <div className="mt-1 text-[11.5px] font-medium text-ink/50 italic">
            &ldquo;{m.note}&rdquo;
          </div>
        ) : null}
      </div>
      <span
        className="flex-none rounded-full text-[9.5px] font-bold uppercase"
        style={{
          background: chip.bg,
          color: chip.fg,
          letterSpacing: '.05em',
          padding: '4px 9px',
        }}
      >
        {chip.label}
      </span>
    </Card>
  )
}
