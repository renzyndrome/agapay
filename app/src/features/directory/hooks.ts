import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '#/auth'
import { memberIdOf } from '#/lib/auth'
import { primaryCircleOf } from '#/lib/circleChoice'
import { getSupabase, isDemoMode } from '#/lib/supabase'
import { useStore } from '#/store'
import { disciplerFromSeed, lifeGroupFromSeed } from '#/features/demo-adapters'
import type {
  DirectoryEntry,
  DisciplerSummary,
  LifeGroupSummary,
  UnassignedMember,
} from '#/features/types'
import type { Result } from '#/features/disciples/hooks'
import {
  fetchDisciplers,
  fetchLifeGroups,
  fetchSearchDirectory,
  fetchUnassignedMembers,
} from '#/features/directory/api'
import { directoryKeys } from '#/features/directory/queryKeys'

/** A Result whose live query can be re-run (a no-op in demo). */
export interface RefetchableResult<T> extends Result<T> {
  refetch: () => void
}

const noop = () => {}

export function useLifeGroups(): RefetchableResult<Array<LifeGroupSummary>> {
  const store = useStore()
  const supabase = getSupabase()
  const query = useQuery({
    queryKey: directoryKeys.lifeGroups(),
    queryFn: () => fetchLifeGroups(supabase as NonNullable<typeof supabase>),
    enabled: !isDemoMode && Boolean(supabase),
    staleTime: 5 * 60_000,
  })

  const seedGroups = store.lifeGroups
  const rows = query.data
  const { refetch } = query

  return useMemo(() => {
    if (isDemoMode) {
      return {
        data: seedGroups.map(lifeGroupFromSeed),
        isLoading: false,
        error: null,
        refetch: noop,
      }
    }
    return {
      data: rows ?? [],
      isLoading: query.isPending,
      error: query.error,
      refetch: () => void refetch(),
    }
  }, [seedGroups, rows, query.isPending, query.error, refetch])
}

export function useDisciplers(): Result<Array<DisciplerSummary>> {
  const store = useStore()
  const supabase = getSupabase()
  const { data: lifeGroups } = useLifeGroups()

  const query = useQuery({
    queryKey: directoryKeys.disciplers(),
    queryFn: () => fetchDisciplers(supabase as NonNullable<typeof supabase>),
    enabled: !isDemoMode && Boolean(supabase),
    staleTime: 60_000,
  })

  const seedDisciplers = store.disciplers
  const seedDisciples = store.disciples
  const rows = query.data

  return useMemo(() => {
    if (isDemoMode) {
      return {
        data: seedDisciplers.map((x) => disciplerFromSeed(x, seedDisciples)),
        isLoading: false,
        error: null,
      }
    }
    // Joined at render from the current circle list (see fetchDisciplers).
    return {
      data: (rows ?? []).map((row) => ({
        ...row,
        lifeGroupId: primaryCircleOf(lifeGroups, row.id),
      })),
      isLoading: query.isPending,
      error: query.error,
    }
  }, [seedDisciplers, seedDisciples, rows, lifeGroups, query.isPending, query.error])
}

/** Admin-only, live-only: members nobody is walking with (GAPS #36).
 *  In demo it is always empty, so the seeded prototype stays pixel-identical. */
export function useUnassignedMembers(): Result<Array<UnassignedMember>> {
  const supabase = getSupabase()
  const { role } = useAuth()
  const isAdmin = role.kind === 'admin'

  const query = useQuery({
    queryKey: directoryKeys.unassigned(),
    queryFn: () => fetchUnassignedMembers(supabase as NonNullable<typeof supabase>),
    enabled: !isDemoMode && Boolean(supabase) && isAdmin,
    staleTime: 60_000,
  })

  const rows = query.data

  return useMemo(() => {
    if (isDemoMode || !isAdmin) return { data: [], isLoading: false, error: null }
    return {
      data: rows ?? [],
      isLoading: query.isPending,
      error: query.error,
    }
  }, [isAdmin, rows, query.isPending, query.error])
}

/** The signed-in user's own member id: from the account link when live (a
 *  discipler, or an admin who is also a member), the demo discipler
 *  otherwise. Null for an admin without a member record. */
export function useMyMemberId(): string | null {
  const store = useStore()
  const { role } = useAuth()
  if (isDemoMode) return store.currentDisciplerId
  return memberIdOf(role)
}

/** Every active directory member for the "Add a disciple" search: name,
 *  stage, satellite and current discipler. Demo mode builds the same list
 *  from the seeded disciples plus a few members nobody walks with yet. */
export function useDirectorySearchPool(): RefetchableResult<Array<DirectoryEntry>> {
  const store = useStore()
  const supabase = getSupabase()
  const { role } = useAuth()
  const canSearch = role.kind === 'discipler' || role.kind === 'admin'

  const query = useQuery({
    queryKey: directoryKeys.search(),
    queryFn: () => fetchSearchDirectory(supabase as NonNullable<typeof supabase>),
    enabled: !isDemoMode && Boolean(supabase) && canSearch,
    staleTime: 60_000,
  })

  const { disciples, directoryExtra, disciplers } = store
  const rows = query.data
  const { refetch } = query

  return useMemo(() => {
    if (isDemoMode) {
      const disciplerName = new Map(disciplers.map((d) => [d.id, d.name]))
      const data: Array<DirectoryEntry> = [
        ...disciples.map((d) => ({
          id: d.id,
          name: d.name,
          stage: d.stage,
          disciplerId: d.disciplerId,
          disciplerName: disciplerName.get(d.disciplerId) ?? null,
          satelliteName: 'Quest Laguna Main',
        })),
        ...directoryExtra.map((m) => ({
          id: m.id,
          name: m.name,
          stage: m.stage,
          disciplerId: null,
          disciplerName: null,
          satelliteName: m.satelliteName,
        })),
      ]
      return { data, isLoading: false, error: null, refetch: noop }
    }
    return {
      data: rows ?? [],
      isLoading: query.isPending,
      error: query.error,
      refetch: () => void refetch(),
    }
  }, [
    disciples,
    directoryExtra,
    disciplers,
    rows,
    query.isPending,
    query.error,
    refetch,
  ])
}
