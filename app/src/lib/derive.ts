import { ENGAGEMENT } from '#/lib/engagement'
import { addDays, fromISODate, today } from '#/lib/format'
import type { Disciple, Meeting } from '#/data/seed'

export function checklistPct(d: Disciple): number {
  if (d.checklist.length === 0) return 0
  const done = d.checklist.filter((it) => it.done).length
  return Math.round((100 * done) / d.checklist.length)
}

export interface QueueGroups {
  quiet: Array<Disciple>
  cooling: Array<Disciple>
  steady: Array<Disciple>
  queueCount: number
  ringFraction: number
}

/** Queue sorts longest-quiet first inside each group (RULES.md #11). */
export function queueGroups(mine: Array<Disciple>): QueueGroups {
  const byQuiet = (a: Disciple, b: Disciple) => b.days - a.days
  const quiet = mine.filter((d) => d.days > ENGAGEMENT.redAfterDays).sort(byQuiet)
  const cooling = mine
    .filter(
      (d) => d.days > ENGAGEMENT.amberAfterDays && d.days <= ENGAGEMENT.redAfterDays,
    )
    .sort(byQuiet)
  const steady = mine.filter((d) => d.days <= ENGAGEMENT.amberAfterDays)
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

export function upcomingThisWeek(meetings: Array<Meeting>): Array<Meeting> {
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
  Exclude<Meeting['status'], 'upcoming'> | 'upcoming',
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
