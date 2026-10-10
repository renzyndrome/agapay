import type { EngagementKey } from '#/lib/engagement'
import type { Stage } from '#/lib/stages'

/** One shape for every screen, in BOTH demo and live mode.
 *  Demo maps the seeded objects into it; live maps rows from
 *  discipleship.disciple_engagement. Screens never see raw DB rows. */
export interface DiscipleSummary {
  id: string
  memberId: string | null
  name: string
  stage: Stage
  /** days since the last PERSONAL touch; null = never (reads as at-risk) */
  days: number | null
  engagement: EngagementKey
  disciplerId: string
  lifeGroupId: string | null
  cohort: string | null
  /** "Life Group, Jun 8" — for the queue blurb */
  lastSeen: string
  inStageLabel: string
  checklistDone: number
  checklistTotal: number
}

export interface TimelineEntry {
  kind: 'activity' | 'meeting' | 'note' | 'check' | 'stage'
  title: string
  dateLabel: string
  note?: string
}

export interface ChecklistEntry {
  id: string
  text: string
  done: boolean
}

export interface MilestoneEntry {
  title: string
  dateLabel: string | null
}

export interface MeetingSummary {
  id: string
  discipleId: string
  discipleName: string
  dateISO: string
  time: string
  mode: 'inperson' | 'online'
  place: string
  status: 'upcoming' | 'completed' | 'cancelled' | 'noshow'
  note?: string
}

export interface DisciplerSummary {
  id: string
  name: string
  lifeGroupId: string | null
  load: number
  lastLogDays: number | null
}

export interface LifeGroupSummary {
  id: string
  name: string
  satellite: string
  leaderDisciplerId: string | null
  coLeaderId: string | null
}

/** A directory member with no discipler assigned — invisible to every queue
 *  until someone takes them on. Surfaced to admins (design/GAPS.md #36). */
export interface UnassignedMember {
  id: string
  name: string
  stage: Stage
  joinedDate: string | null
}

/** A directory member as the "Add a disciple" search shows them: who they
 *  are and whether someone already walks with them. */
export interface DirectoryEntry {
  id: string
  name: string
  stage: Stage
  disciplerId: string | null
  disciplerName: string | null
  satelliteName: string | null
}

export function checklistPctOf(d: {
  checklistDone: number
  checklistTotal: number
}): number {
  if (d.checklistTotal === 0) return 0
  return Math.round((100 * d.checklistDone) / d.checklistTotal)
}
