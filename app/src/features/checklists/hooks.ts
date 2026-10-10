import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSupabase, isDemoMode } from '#/lib/supabase'
import { STAGES } from '#/lib/stages'
import type { Stage } from '#/lib/stages'
import { useStore } from '#/store'
import type { Result } from '#/features/disciples/hooks'
import { checklistKeys } from '#/features/checklists/queryKeys'

export type MasterChecklistMap = Record<Stage, Array<string>>

const EMPTY: MasterChecklistMap = {
  'New Believer': [],
  Growing: [],
  Leader: [],
}

/** The DB stores stages in directory vocabulary ('Newbie'); the UI never does. */
export function useMasterChecklists(): Result<MasterChecklistMap> {
  const store = useStore()
  const supabase = getSupabase()

  const query = useQuery({
    queryKey: checklistKeys.master(),
    queryFn: async () => {
      const client = supabase as NonNullable<typeof supabase>
      const { data, error } = await client
        .schema('discipleship')
        .from('master_checklist_items')
        .select('stage, position, text')
        .order('position')
      if (error) throw error
      const out: MasterChecklistMap = {
        'New Believer': [],
        Growing: [],
        Leader: [],
      }
      const rows: Array<{ stage: string; text: string }> = data
      for (const row of rows) {
        const uiStage = (row.stage === 'Newbie' ? 'New Believer' : row.stage) as Stage
        if (STAGES.includes(uiStage)) out[uiStage].push(row.text)
      }
      return out
    },
    enabled: !isDemoMode && Boolean(supabase),
    staleTime: 5 * 60_000,
  })

  const seed = store.masterChecklists
  const rows = query.data

  return useMemo(() => {
    if (isDemoMode) return { data: seed, isLoading: false, error: null }
    return {
      data: rows ?? EMPTY,
      isLoading: query.isPending,
      error: query.error,
    }
  }, [seed, rows, query.isPending, query.error])
}
