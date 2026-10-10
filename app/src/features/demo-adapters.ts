/** Maps the seeded prototype objects onto the same domain types the live
 *  Supabase queries produce, so every screen renders one shape in both modes. */
import type { Disciple, Discipler, LifeGroup, Meeting } from '#/data/seed'
import { engagementKeyFromDays } from '#/lib/engagement'
import type {
  DiscipleSummary,
  DisciplerSummary,
  LifeGroupSummary,
  MeetingSummary,
} from '#/features/types'

export function summaryFromSeed(d: Disciple): DiscipleSummary {
  return {
    id: d.id,
    memberId: d.id,
    name: d.name,
    stage: d.stage,
    days: d.days,
    engagement: engagementKeyFromDays(d.days),
    disciplerId: d.disciplerId,
    lifeGroupId: d.lifeGroupId || null,
    cohort: d.cohort,
    lastSeen: d.lastSeen,
    inStageLabel: d.inStageLabel,
    checklistDone: d.checklist.filter((c) => c.done).length,
    checklistTotal: d.checklist.length,
  }
}

/** The disciple's name is joined at render (see visibleMeetings). */
export function meetingFromSeed(
  m: Meeting,
): Omit<MeetingSummary, 'discipleName'> {
  return {
    id: m.id,
    discipleId: m.discipleId,
    dateISO: m.dateISO,
    time: m.time,
    mode: m.mode,
    place: m.place,
    status: m.status,
    note: m.note,
  }
}

export function disciplerFromSeed(
  x: Discipler,
  disciples: Array<Disciple>,
): DisciplerSummary {
  return {
    id: x.id,
    name: x.name,
    lifeGroupId: x.lifeGroupId,
    load: disciples.filter((d) => d.disciplerId === x.id).length,
    lastLogDays: x.lastLogDays,
  }
}

export function lifeGroupFromSeed(g: LifeGroup): LifeGroupSummary {
  return {
    id: g.id,
    name: g.name,
    satellite: g.satellite,
    leaderDisciplerId: g.leaderDisciplerId,
    coLeaderId: null,
  }
}
