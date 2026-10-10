import type { SupabaseClient } from '@supabase/supabase-js'
import type { MeetingSummary } from '#/features/types'

const DISCIPLESHIP = 'discipleship'

interface MeetingRow {
  id: string
  disciple_id: string
  scheduled_at: string
  mode: string
  place: string | null
  status: string
  note: string | null
}

/** RLS-scoped. Names are joined client-side from the disciple list at
 *  render (see visibleMeetings) so the query stays a plain table read (no
 *  cross-schema embed) and the cache never holds a stale name. */
export async function fetchMeetings(
  supabase: SupabaseClient,
): Promise<Array<Omit<MeetingSummary, 'discipleName'>>> {
  const { data, error } = await supabase
    .schema(DISCIPLESHIP)
    .from('meetings')
    .select('id, disciple_id, scheduled_at, mode, place, status, note')
    .order('scheduled_at', { ascending: true })
  if (error) throw error

  const rows: Array<MeetingRow> = data
  return rows.map((row) => {
    const when = new Date(row.scheduled_at)
    const hh = String(when.getHours()).padStart(2, '0')
    const mm = String(when.getMinutes()).padStart(2, '0')
    const m = String(when.getMonth() + 1).padStart(2, '0')
    const d = String(when.getDate()).padStart(2, '0')
    return {
      id: row.id,
      discipleId: row.disciple_id,
      dateISO: `${when.getFullYear()}-${m}-${d}`,
      time: `${hh}:${mm}`,
      mode: row.mode as MeetingSummary['mode'],
      place: row.place ?? '',
      status: row.status as MeetingSummary['status'],
      note: row.note ?? undefined,
    }
  })
}
