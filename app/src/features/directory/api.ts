import type { SupabaseClient } from '@supabase/supabase-js'
import type { Stage } from '#/lib/stages'
import { fromDbStage } from '#/lib/stages'
import type {
  DirectoryEntry,
  DisciplerSummary,
  LifeGroupSummary,
  UnassignedMember,
} from '#/features/types'

const DISCIPLESHIP = 'discipleship'

interface LoadRow {
  discipler_member_id: string
  discipler_name: string
  load: number
  days_since_log: number | null
  inactive: boolean
}

/** The Quest Circle shown per discipler is not read here: the hook joins it
 *  from the current circle list at render, so the cache never holds a
 *  circle from an older (or not yet loaded) list. */
export async function fetchDisciplers(
  supabase: SupabaseClient,
): Promise<Array<Omit<DisciplerSummary, 'lifeGroupId'>>> {
  const { data, error } = await supabase
    .schema(DISCIPLESHIP)
    .from('discipler_load')
    .select('*')
    .order('load', { ascending: false })
  if (error) throw error
  const rows: Array<LoadRow> = data
  return rows.map((row) => ({
    id: row.discipler_member_id,
    name: row.discipler_name,
    load: Number(row.load),
    lastLogDays: row.days_since_log,
  }))
}

/** Quest Circles come from the directory's own cell_groups. */
export async function fetchLifeGroups(
  supabase: SupabaseClient,
): Promise<Array<LifeGroupSummary>> {
  const { data, error } = await supabase
    .from('cell_groups')
    .select('id, name, leader_id, co_leader_id, satellites(name)')
    .eq('is_active', true)
    // Teams (YS Reinforcement, Fulltimer, ...) are not discipleship circles:
    // never offered as a Quest Circle, never shown as one.
    .eq('is_team', false)
    .order('name')
  if (error) throw error
  interface CellGroupRow {
    id: string
    name: string
    leader_id: string | null
    co_leader_id: string | null
    // PostgREST returns an embedded row as an object or an array depending on
    // how it infers the relationship; accept both.
    satellites: { name: string } | Array<{ name: string }> | null
  }
  const rows: Array<CellGroupRow> = data
  return rows.map((row) => {
    const sat = Array.isArray(row.satellites)
      ? row.satellites[0]
      : row.satellites
    return {
      id: row.id,
      name: row.name,
      satellite: sat?.name ?? 'Quest Laguna',
      leaderDisciplerId: row.leader_id,
      coLeaderId: row.co_leader_id,
    }
  })
}

/** Members with nobody walking with them — they appear in no queue at all.
 *  Admin-only surface; RLS lets any authenticated user read members, so we
 *  only render this where an admin is looking. */
export async function fetchUnassignedMembers(
  supabase: SupabaseClient,
): Promise<Array<UnassignedMember>> {
  const { data, error } = await supabase
    .from('members')
    .select('id, name, discipleship_stage, joined_date')
    .is('discipler_id', null)
    .eq('is_archived', false)
    .order('joined_date', { ascending: false, nullsFirst: false })
  if (error) throw error
  const rows: Array<{
    id: string
    name: string
    discipleship_stage: string
    joined_date: string | null
  }> = data
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    stage: (row.discipleship_stage === 'Newbie'
      ? 'New Believer'
      : row.discipleship_stage) as Stage,
    joinedDate: row.joined_date,
  }))
}

/** Every active directory member, for the discipler's "Add a disciple"
 *  search. Reads only what the search shows: name, stage, satellite and who
 *  (if anyone) walks with them. No contact details leave the database. */
export async function fetchSearchDirectory(
  supabase: SupabaseClient,
): Promise<Array<DirectoryEntry>> {
  const { data, error } = await supabase
    .from('members')
    .select(
      'id, name, discipleship_stage, discipler_id, satellite:satellites!members_satellite_id_fkey(name)',
    )
    .eq('is_archived', false)
    .order('name')
  if (error) throw error
  interface Row {
    id: string
    name: string
    discipleship_stage: string
    discipler_id: string | null
    // PostgREST returns an embedded row as an object or an array depending on
    // how it infers the relationship; accept both.
    satellite: { name: string } | Array<{ name: string }> | null
  }
  const rows: Array<Row> = data
  const nameById = new Map(rows.map((r) => [r.id, r.name]))
  return rows.map((r) => {
    const sat = Array.isArray(r.satellite) ? r.satellite[0] : r.satellite
    return {
      id: r.id,
      name: r.name,
      stage: fromDbStage(r.discipleship_stage),
      disciplerId: r.discipler_id,
      disciplerName: r.discipler_id
        ? (nameById.get(r.discipler_id) ?? null)
        : null,
      satelliteName: sat?.name ?? null,
    }
  })
}
