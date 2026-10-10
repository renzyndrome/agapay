import { addDays, fromISODate, today } from '#/lib/format'
import type { DiscipleSummary, MeetingSummary } from '#/features/types'

export interface QueueGroups {
  quiet: Array<DiscipleSummary>
  cooling: Array<DiscipleSummary>
  steady: Array<DiscipleSummary>
  queueCount: number
  ringFraction: number
}

/** Groups read the SERVER-derived engagement key, never a recomputed one
 *  (RULES.md #18 — one source of truth). Longest-quiet first; a disciple with
 *  no personal touch at all sorts to the very top. */
export function queueGroups(mine: Array<DiscipleSummary>): QueueGroups {
  const quietness = (d: DiscipleSummary) => d.days ?? Number.MAX_SAFE_INTEGER
  const byQuiet = (a: DiscipleSummary, b: DiscipleSummary) =>
    quietness(b) - quietness(a)

  const quiet = mine.filter((d) => d.engagement === 'red').sort(byQuiet)
  const cooling = mine.filter((d) => d.engagement === 'amber').sort(byQuiet)
  const steady = mine.filter((d) => d.engagement === 'green')
  const queueCount = quiet.length + cooling.length
  const done = mine.length - queueCount
  return {
    quiet,
    cooling,
    steady,
    queueCount,
    ringFraction: mine.length ? done / mine.length : 1,
  }
}

export function upcomingThisWeek(
  meetings: Array<MeetingSummary>,
): Array<MeetingSummary> {
  const start = today()
  start.setHours(0, 0, 0, 0)
  const end = addDays(start, 7)
  return meetings
    .filter((m) => {
      if (m.status !== 'upcoming') return false
      const d = fromISODate(m.dateISO)
      return d >= start && d < end
    })
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO))
}

export const MEETING_STATUS_CHIP: Record<
  MeetingSummary['status'],
  { label: string; bg: string; fg: string }
> = {
  upcoming: { label: 'Upcoming', bg: 'var(--color-rose)', fg: 'var(--color-maroon)' },
  completed: {
    label: 'Completed',
    bg: 'var(--color-green-tint)',
    fg: 'var(--color-green)',
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'var(--color-ink-100)',
    fg: 'var(--color-ink-700)',
  },
  noshow: {
    label: 'No-show',
    bg: 'var(--color-amber-tint)',
    fg: 'var(--color-amber-text)',
  },
}
