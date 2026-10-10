import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSupabase, isDemoMode } from '#/lib/supabase'
import { visibleMeetings } from '#/lib/visibleMeetings'
import { useStore } from '#/store'
import { meetingFromSeed } from '#/features/demo-adapters'
import type { MeetingSummary } from '#/features/types'
import { useDisciples } from '#/features/disciples/hooks'
import type { Result } from '#/features/disciples/hooks'
import { fetchMeetings } from '#/features/meetings/api'
import { meetingKeys } from '#/features/meetings/queryKeys'

/** Meetings of the disciples in the loaded list only, named from it: a
 *  meeting of an archived or no-longer-visible disciple is left out. */
export function useMeetings(): Result<Array<MeetingSummary>> {
  const store = useStore()
  const supabase = getSupabase()
  const {
    data: disciples,
    isLoading: disciplesLoading,
    error: disciplesError,
  } = useDisciples('all')

  const query = useQuery({
    queryKey: meetingKeys.list(),
    queryFn: () => fetchMeetings(supabase as NonNullable<typeof supabase>),
    enabled: !isDemoMode && Boolean(supabase),
    staleTime: 30_000,
  })

  const seedMeetings = store.meetings
  const rows = query.data

  return useMemo(() => {
    if (isDemoMode) {
      return {
        data: visibleMeetings(seedMeetings.map(meetingFromSeed), disciples),
        isLoading: false,
        error: null,
      }
    }
    return {
      data: visibleMeetings(rows ?? [], disciples),
      isLoading: query.isPending || disciplesLoading,
      error: query.error ?? disciplesError,
    }
  }, [
    seedMeetings,
    disciples,
    disciplesLoading,
    disciplesError,
    rows,
    query.isPending,
    query.error,
  ])
}
