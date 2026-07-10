import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowUp, Calendar, Check, Plus } from 'lucide-react'
import type { Disciple } from '#/data/seed'
import { MEETING_STATUS_CHIP, checklistPct } from '#/lib/derive'
import { fmtDow, fmtShort, fmtTime12, fromISODate } from '#/lib/format'
import { nextStage } from '#/lib/stages'
import { useStore } from '#/store'
import {
  AvatarDisc,
  Card,
  EngagementBadge,
  ProgressBar,
  StageBadge,
} from '#/components/ui'

export const Route = createFileRoute('/_discipler/disciples/$id')({
  component: ProfileScreen,
})

type ProfileTab = 'timeline' | 'checklist' | 'meetings' | 'milestones'

const TIMELINE_STYLE: Record<string, { glyph: string; bg: string; fg: string }> = {
  activity: { glyph: '●', bg: 'var(--color-green-tint)', fg: 'var(--color-green)' },
  meeting: { glyph: 'M', bg: 'var(--color-rose)', fg: 'var(--color-maroon)' },
  note: { glyph: 'N', bg: 'var(--color-cream-surface)', fg: 'var(--color-ink-500)' },
  check: { glyph: '✓', bg: 'var(--color-green-tint)', fg: 'var(--color-green)' },
  stage: { glyph: '★', bg: 'var(--color-gold-tint)', fg: 'var(--color-gold-text)' },
}

function ProfileScreen() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { disciples, disciplers, openSheet } = useStore()
  const [tab, setTab] = useState<ProfileTab>('timeline')
  const d = disciples.find((x) => x.id === id)
  if (!d) return null

  const discipler = disciplers.find((x) => x.id === d.disciplerId)
  const ns = nextStage(d.stage)
  const attended = d.attendance.filter(Boolean).length

  const tabStyle = (active: boolean) => ({
    background: active ? 'var(--color-ink)' : 'var(--color-white)',
    color: active ? '#fff' : 'var(--color-ink-700)',
  })

  return (
    <div className="animate-fade absolute inset-0 z-20 flex flex-col bg-cream">
      <div className="flex flex-none items-center gap-2.5 border-b border-cream-border bg-white px-4 py-3.5">
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate({ to: '/disciples' })}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-ink"
        >
          <ArrowLeft size={18} strokeWidth={2.4} />
        </button>
        <span className="font-display text-[14px] font-bold text-ink">
          Disciple profile
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* header */}
        <div className="border-b border-cream-border bg-white px-5 pt-4.5 pb-4">
          <div className="flex items-center gap-3.5">
            <AvatarDisc name={d.name} stage={d.stage} size={60} />
            <div className="min-w-0 flex-1">
              <div className="font-display text-[19px] font-bold tracking-[-.01em] text-ink">
                {d.name}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StageBadge stage={d.stage} />
                <EngagementBadge days={d.days} />
              </div>
              <div className="mt-1.5 text-[11.5px] font-medium text-ink/55">
                Discipler: {discipler?.name ?? '—'} · {d.inStageLabel} in stage
              </div>
            </div>
          </div>

          {/* sparkline */}
          <div className="mt-4 rounded-(--radius-input) bg-cream px-3.5 py-3">
            <div className="flex items-baseline justify-between">
              <span
                className="text-[10px] font-bold uppercase text-ink/50"
                style={{ letterSpacing: '.1em' }}
              >
                12-week attendance
              </span>
              <span className="text-[11px] font-bold text-ink">
                {attended} of 12 Sundays
              </span>
            </div>
            <div className="mt-2 flex h-[30px] items-end gap-1">
              {d.attendance.map((went, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-[3px]"
                  style={{
                    height: went ? 26 : 6,
                    background: went
                      ? 'var(--color-green)'
                      : 'var(--color-cream-border)',
                  }}
                />
              ))}
            </div>
          </div>

          {ns ? (
            <button
              type="button"
              onClick={() => openSheet({ kind: 'promote', discipleId: d.id })}
              className="press mt-3 flex h-11 w-full cursor-pointer items-center justify-center gap-[7px] rounded-full border-[1.5px] border-brand text-[13px] font-bold text-maroon"
            >
              <ArrowUp size={14} strokeWidth={2.4} />
              Promote to {ns}
            </button>
          ) : null}
        </div>

        {/* section tabs */}
        <div className="flex gap-[5px] overflow-x-auto px-5 pt-3.5 pb-1">
          {(['timeline', 'checklist', 'meetings', 'milestones'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="flex-none cursor-pointer rounded-full border-[1.5px] border-cream-border px-3.5 py-2 text-[11.5px] font-bold capitalize"
              style={tabStyle(tab === t)}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'timeline' && <TimelineTab disciple={d} />}
        {tab === 'checklist' && <ChecklistTab disciple={d} />}
        {tab === 'meetings' && <MeetingsTab discipleId={d.id} />}
        {tab === 'milestones' && <MilestonesTab disciple={d} />}

        {/* bottom actions */}
        <div className="flex gap-2 px-5 pb-6">
          <button
            type="button"
            onClick={() => openSheet({ kind: 'log', discipleId: d.id })}
            className="press flex h-11.5 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-brand text-[13px] font-bold text-white shadow-(--shadow-glow) hover:bg-brand-press"
          >
            <Plus size={14} strokeWidth={2.4} /> Log activity
          </button>
          <button
            type="button"
            onClick={() => openSheet({ kind: 'sched', discipleId: d.id })}
            className="press flex h-11.5 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border-[1.5px] border-cream-border bg-white text-[13px] font-bold text-maroon"
          >
            <Calendar size={14} strokeWidth={2.2} /> Schedule
          </button>
        </div>
      </div>
    </div>
  )
}

function TimelineTab({ disciple: d }: { disciple: Disciple }) {
  return (
    <div className="flex flex-col px-5 pt-3 pb-5">
      {d.timeline.map((ev, i) => {
        const s = TIMELINE_STYLE[ev.kind] ?? TIMELINE_STYLE.activity
        const isLast = i === d.timeline.length - 1
        return (
          <div key={i} className="flex gap-3">
            <div className="flex w-[30px] flex-none flex-col items-center">
              <div
                className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-[10px] font-bold"
                style={{ background: s.bg, color: s.fg }}
              >
                {s.glyph}
              </div>
              {!isLast && <div className="my-1 w-[2px] flex-1 bg-cream-border" />}
            </div>
            <div className="flex-1 pb-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-[13px] font-bold text-ink">
                  {ev.title}
                </span>
                <span className="flex-none text-[10.5px] font-semibold text-ink/45">
                  {ev.dateLabel}
                </span>
              </div>
              {ev.note ? (
                <div className="mt-[3px] text-[12px] leading-normal font-medium text-ink/60">
                  {ev.note}
                </div>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ChecklistTab({ disciple: d }: { disciple: Disciple }) {
  const { toggleChecklistItem } = useStore()
  const pct = checklistPct(d)
  return (
    <div className="px-5 pt-3 pb-5">
      <Card className="p-4">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-[13px] font-bold text-ink">
            {d.stage} checklist
          </span>
          <span className="text-[12px] font-bold text-maroon">{pct}%</span>
        </div>
        <div className="mt-2">
          <ProgressBar pct={pct} height={6} />
        </div>
        <div className="mt-2 flex flex-col">
          {d.checklist.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleChecklistItem(d.id, i)}
              className="flex cursor-pointer items-center gap-3 border-b border-cream-surface py-[11px] text-left last:border-b-0"
            >
              <span
                className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px]"
                style={{
                  background: item.done ? 'var(--color-brand)' : 'var(--color-white)',
                  border: `1.5px solid ${item.done ? 'var(--color-brand)' : 'var(--color-cream-border)'}`,
                }}
              >
                {item.done && (
                  <Check size={13} strokeWidth={3} className="text-white" />
                )}
              </span>
              <span
                className="text-[13px] font-semibold"
                style={{
                  color: item.done ? 'rgb(11 11 12 / .4)' : 'var(--color-ink)',
                  textDecoration: item.done ? 'line-through' : 'none',
                }}
              >
                {item.text}
              </span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}

function MeetingsTab({ discipleId }: { discipleId: string }) {
  const { meetings } = useStore()
  const rows = meetings
    .filter((m) => m.discipleId === discipleId)
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO))
  return (
    <div className="flex flex-col gap-2 px-5 pt-3 pb-5">
      {rows.length === 0 ? (
        <Card className="px-4 py-4 text-center text-[12px] font-medium text-ink/50">
          No meetings yet — schedule the first one below.
        </Card>
      ) : (
        rows.map((m) => {
          const chip = MEETING_STATUS_CHIP[m.status]
          const date = fromISODate(m.dateISO)
          return (
            <Card key={m.id} className="flex items-center gap-3 rounded-[14px] px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-display text-[13px] font-bold text-ink">
                  {m.status === 'upcoming' ? 'Upcoming — ' : ''}
                  {fmtDow(date)} {fmtShort(date)}, {fmtTime12(m.time)}
                </div>
                <div className="truncate text-[11.5px] font-medium text-ink/55">
                  {m.place}
                  {m.note ? ` · “${m.note}”` : ''}
                </div>
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
        })
      )}
    </div>
  )
}

function MilestonesTab({ disciple: d }: { disciple: Disciple }) {
  return (
    <div className="px-5 pt-3 pb-5">
      <Card className="px-4 py-1.5">
        {d.milestones.map((ms, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-cream-surface py-3 last:border-b-0"
          >
            <div
              className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full"
              style={{
                background: ms.dateLabel
                  ? 'var(--color-green-tint)'
                  : 'var(--color-cream-surface)',
              }}
            >
              <Check
                size={15}
                strokeWidth={2.4}
                style={{
                  color: ms.dateLabel ? 'var(--color-green)' : 'var(--color-ink-300)',
                }}
              />
            </div>
            <div className="flex-1">
              <div className="font-display text-[13px] font-bold text-ink">
                {ms.title}
              </div>
              <div
                className="text-[11.5px] font-medium"
                style={{
                  color: ms.dateLabel ? 'rgb(11 11 12 / .55)' : 'var(--color-amber)',
                }}
              >
                {ms.dateLabel ?? 'Not yet'}
              </div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}
