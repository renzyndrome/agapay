import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '#/auth'
import { memberIdOf } from '#/lib/auth'
import { getSupabase, isDemoMode } from '#/lib/supabase'
import { useStore } from '#/store'
import { summaryFromSeed } from '#/features/demo-adapters'
import type {
  ChecklistEntry,
  DiscipleSummary,
  MilestoneEntry,
  TimelineEntry,
} from '#/features/types'
import {
  fetchAttendance,
  fetchChecklist,
  fetchDisciples,
  fetchMilestones,
  fetchTimeline,
} from '#/features/disciples/api'
import { discipleKeys } from '#/features/disciples/queryKeys'

export interface Result<T> {
  data: T
  isLoading: boolean
  error: Error | null
}

const LIVE_STALE_MS = 30_000

/** 'mine' = the signed-in discipler's people (RLS already scopes a discipler;
 *  the extra filter matters only when an admin opens a discipler screen: a
 *  linked admin sees their own disciples, an unlinked admin sees everyone). */
export function useDisciples(scope: 'mine' | 'all'): Result<Array<DiscipleSummary>> {
  const store = useStore()
  const { role } = useAuth()
  const supabase = getSupabase()

  const query = useQuery({
    queryKey: discipleKeys.list(),
    queryFn: () => fetchDisciples(supabase as NonNullable<typeof supabase>),
    enabled: !isDemoMode && Boolean(supabase),
    staleTime: LIVE_STALE_MS,
  })

  const seedDisciples = store.disciples
  const currentDisciplerId = store.currentDisciplerId
  const rows = query.data
  const myMemberId = memberIdOf(role)

  return useMemo(() => {
    if (isDemoMode) {
      const all = seedDisciples.map(summaryFromSeed)
      return {
        data:
          scope === 'mine'
            ? all.filter((d) => d.disciplerId === currentDisciplerId)
            : all,
        isLoading: false,
        error: null,
      }
    }
    const live = rows ?? []
    return {
      data:
        scope === 'mine' && myMemberId
          ? live.filter((d) => d.disciplerId === myMemberId)
          : live,
      isLoading: query.isPending,
      error: query.error,
    }
  }, [
    scope,
    seedDisciples,
    currentDisciplerId,
    rows,
    myMemberId,
    query.isPending,
    query.error,
  ])
}

export function useDisciple(id: string): Result<DiscipleSummary | null> {
  const { data, isLoading, error } = useDisciples('all')
  return useMemo(
    () => ({ data: data.find((d) => d.id === id) ?? null, isLoading, error }),
    [data, id, isLoading, error],
  )
}

export function useTimeline(discipleId: string): Result<Array<TimelineEntry>> {
  const store = useStore()
  const supabase = getSupabase()
  const query = useQuery({
    queryKey: discipleKeys.timeline(discipleId),
    queryFn: () =>
      fetchTimeline(supabase as NonNullable<typeof supabase>, discipleId),
    enabled: !isDemoMode && Boolean(supabase) && Boolean(discipleId),
    staleTime: LIVE_STALE_MS,
  })

  const seed = store.disciples.find((d) => d.id === discipleId)
  const rows = query.data

  return useMemo(() => {
    if (isDemoMode) {
      return {
        data: (seed?.timeline ?? []).map((e) => ({
          kind: e.kind,
          title: e.title,
          dateLabel: e.dateLabel,
          note: e.note,
        })),
        isLoading: false,
        error: null,
      }
    }
    return {
      data: rows ?? [],
      isLoading: query.isPending,
      error: query.error,
    }
  }, [seed, rows, query.isPending, query.error])
}

export function useChecklist(discipleId: string): Result<Array<ChecklistEntry>> {
  const store = useStore()
  const supabase = getSupabase()
  const query = useQuery({
    queryKey: discipleKeys.checklist(discipleId),
    queryFn: () =>
      fetchChecklist(supabase as NonNullable<typeof supabase>, discipleId),
    enabled: !isDemoMode && Boolean(supabase) && Boolean(discipleId),
    staleTime: LIVE_STALE_MS,
  })

  const seed = store.disciples.find((d) => d.id === discipleId)
  const rows = query.data

  return useMemo(() => {
    if (isDemoMode) {
      return {
        data: (seed?.checklist ?? []).map((item, i) => ({
          id: `${discipleId}-${i}`,
          text: item.text,
          done: item.done,
        })),
        isLoading: false,
        error: null,
      }
    }
    return {
      data: rows ?? [],
      isLoading: query.isPending,
      error: query.error,
    }
  }, [seed, discipleId, rows, query.isPending, query.error])
}

export function useMilestones(discipleId: string): Result<Array<MilestoneEntry>> {
  const store = useStore()
  const supabase = getSupabase()
  const query = useQuery({
    queryKey: discipleKeys.milestones(discipleId),
    queryFn: () =>
      fetchMilestones(supabase as NonNullable<typeof supabase>, discipleId),
    enabled: !isDemoMode && Boolean(supabase) && Boolean(discipleId),
    staleTime: LIVE_STALE_MS,
  })

  const seed = store.disciples.find((d) => d.id === discipleId)
  const rows = query.data

  return useMemo(() => {
    if (isDemoMode) {
      return { data: seed?.milestones ?? [], isLoading: false, error: null }
    }
    return {
      data: rows ?? [],
      isLoading: query.isPending,
      error: query.error,
    }
  }, [seed, rows, query.isPending, query.error])
}

/** 12 booleans, oldest Sunday first. */
export function useAttendance(discipleId: string): Result<Array<boolean>> {
  const store = useStore()
  const supabase = getSupabase()
  const query = useQuery({
    queryKey: discipleKeys.attendance(discipleId),
    queryFn: () =>
      fetchAttendance(supabase as NonNullable<typeof supabase>, discipleId),
    enabled: !isDemoMode && Boolean(supabase) && Boolean(discipleId),
    staleTime: LIVE_STALE_MS,
  })

  const seed = store.disciples.find((d) => d.id === discipleId)
  const rows = query.data

  return useMemo(() => {
    if (isDemoMode) {
      return { data: seed?.attendance ?? [], isLoading: false, error: null }
    }
    return {
      data: rows ?? [],
      isLoading: query.isPending,
      error: query.error,
    }
  }, [seed, rows, query.isPending, query.error])
}
