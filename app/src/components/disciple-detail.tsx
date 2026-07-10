import { Check } from 'lucide-react'
import type { Disciple } from '#/data/seed'
import { MEETING_STATUS_CHIP, checklistPct } from '#/lib/derive'
import { fmtDow, fmtShort, fmtTime12, fromISODate } from '#/lib/format'
import { useStore } from '#/store'
import { Card, ProgressBar } from '#/components/ui'

/** Shared disciple detail sections — used by the discipler profile screen
 *  (mobile push page) and the admin detail modal. */

const TIMELINE_STYLE: Record<string, { glyph: string; bg: string; fg: string }> = {
  activity: { glyph: '●', bg: 'var(--color-green-tint)', fg: 'var(--color-green)' },
  meeting: { glyph: 'M', bg: 'var(--color-rose)', fg: 'var(--color-maroon)' },
  note: { glyph: 'N', bg: 'var(--color-cream-surface)', fg: 'var(--color-ink-500)' },
  check: { glyph: '✓', bg: 'var(--color-green-tint)', fg: 'var(--color-green)' },
  stage: { glyph: '★', bg: 'var(--color-gold-tint)', fg: 'var(--color-gold-text)' },
}

export function AttendanceSparkline({ disciple: d }: { disciple: Disciple }) {
  const attended = d.attendance.filter(Boolean).length
  return (
    <div className="rounded-(--radius-input) bg-cream px-3.5 py-3">
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
              background: went ? 'var(--color-green)' : 'var(--color-cream-border)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

export function TimelineList({ disciple: d }: { disciple: Disciple }) {
  return (
    <div className="flex flex-col">
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

export function ChecklistCard({ disciple: d }: { disciple: Disciple }) {
  const { toggleChecklistItem } = useStore()
  const pct = checklistPct(d)
  return (
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
              {item.done && <Check size={13} strokeWidth={3} className="text-white" />}
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
  )
}

export function MeetingsList({ discipleId }: { discipleId: string }) {
  const { meetings } = useStore()
  const rows = meetings
    .filter((m) => m.discipleId === discipleId)
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO))
  if (rows.length === 0) {
    return (
      <Card className="px-4 py-4 text-center text-[12px] font-medium text-ink/50">
        No meetings yet.
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((m) => {
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
      })}
    </div>
  )
}

export function MilestonesList({ disciple: d }: { disciple: Disciple }) {
  return (
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
  )
}
