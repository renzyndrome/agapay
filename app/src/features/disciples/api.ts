import type { SupabaseClient } from '@supabase/supabase-js'
import { fmtShort, fromISODate } from '#/lib/format'
import type { Stage } from '#/lib/stages'
import type {
  ChecklistEntry,
  DiscipleSummary,
  MilestoneEntry,
  TimelineEntry,
} from '#/features/types'

const DISCIPLESHIP = 'discipleship'

interface EngagementRow {
  disciple_id: string
  member_id: string | null
  name: string
  stage: string
  discipler_id: string | null
  cohort: string | null
  last_activity_on: string | null
  last_activity_type: string | null
  days_since: number | null
  engagement: string
  life_group_id: string | null
  life_group_name: string | null
  checklist_done: number
  checklist_total: number
  in_stage_since: string | null
}

function monthsSince(iso: string | null): string {
  if (!iso) return 'recently'
  const then = new Date(iso)
  const months = Math.max(
    0,
    Math.round((Date.now() - then.getTime()) / (1000 * 60 * 60 * 24 * 30)),
  )
  if (months < 1) return 'less than a month'
  if (months === 1) return '1 month'
  return `${months} months`
}

export function mapEngagementRow(row: EngagementRow): DiscipleSummary {
  const lastSeen =
    row.last_activity_on && row.last_activity_type
      ? `${row.last_activity_type}, ${fmtShort(fromISODate(row.last_activity_on))}`
      : 'No activity logged yet'
  return {
    id: row.disciple_id,
    memberId: row.member_id,
    name: row.name,
    stage: row.stage as Stage,
    days: row.days_since,
    engagement: row.engagement as DiscipleSummary['engagement'],
    disciplerId: row.discipler_id ?? '',
    lifeGroupId: row.life_group_id,
    cohort: row.cohort,
    lastSeen,
    inStageLabel: monthsSince(row.in_stage_since),
    checklistDone: row.checklist_done,
    checklistTotal: row.checklist_total,
  }
}

/** RLS scopes this: a discipler gets only their disciples, an admin gets all. */
export async function fetchDisciples(
  supabase: SupabaseClient,
): Promise<Array<DiscipleSummary>> {
  const { data, error } = await supabase
    .schema(DISCIPLESHIP)
    .from('disciple_engagement')
    .select('*')
    .order('days_since', { ascending: false, nullsFirst: true })
  if (error) throw error
  const rows: Array<EngagementRow> = data
  return rows.map(mapEngagementRow)
}

interface TimelineRow {
  disciple_id: string
  kind: string
  title: string
  event_date: string | null
  note: string | null
  created_at: string
}

export async function fetchTimeline(
  supabase: SupabaseClient,
  discipleId: string,
): Promise<Array<TimelineEntry>> {
  const { data, error } = await supabase
    .schema(DISCIPLESHIP)
    .from('disciple_timeline')
    .select('*')
    .eq('disciple_id', discipleId)
    .order('event_date', { ascending: false })
  if (error) throw error
  const rows: Array<TimelineRow> = data
  return rows.map((row) => ({
    kind: row.kind as TimelineEntry['kind'],
    title: row.title,
    dateLabel: row.event_date ? fmtShort(fromISODate(row.event_date)) : '',
    note: row.note ?? undefined,
  }))
}

export async function fetchChecklist(
  supabase: SupabaseClient,
  discipleId: string,
): Promise<Array<ChecklistEntry>> {
  const { data, error } = await supabase
    .schema(DISCIPLESHIP)
    .from('disciple_checklist_items')
    .select('id, text, done, position')
    .eq('disciple_id', discipleId)
    .order('position')
  if (error) throw error
  const rows: Array<ChecklistEntry> = data
  return rows
}

export async function fetchMilestones(
  supabase: SupabaseClient,
  discipleId: string,
): Promise<Array<MilestoneEntry>> {
  const { data, error } = await supabase
    .schema(DISCIPLESHIP)
    .from('milestones')
    .select('title, achieved_on, position')
    .eq('disciple_id', discipleId)
    .order('position')
  if (error) throw error
  const rows: Array<{ title: string; achieved_on: string | null }> = data
  return rows.map((row) => ({
    title: row.title,
    dateLabel: row.achieved_on ? fmtShort(fromISODate(row.achieved_on)) : null,
  }))
}

/** 12-week Sunday sparkline, straight from the church's QR check-in module. */
export async function fetchAttendance(
  supabase: SupabaseClient,
  discipleId: string,
): Promise<Array<boolean>> {
  const { data, error } = await supabase
    .schema(DISCIPLESHIP)
    .rpc('sunday_attendance', { p_disciple: discipleId })
  if (error) throw error
  const rows: Array<{ attended: boolean }> = data
  return rows.map((row) => row.attended)
}
