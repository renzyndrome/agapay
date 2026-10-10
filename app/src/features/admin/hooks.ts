import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { STAGE_TREND_HISTORY } from '#/data/seed'
import { fmtShort, fromISODate, today } from '#/lib/format'
import { STAGES } from '#/lib/stages'
import type { Stage } from '#/lib/stages'
import { getSupabase, isDemoMode } from '#/lib/supabase'
import { useDisciples } from '#/features/disciples/hooks'
import type { Result } from '#/features/disciples/hooks'
import { adminKeys } from '#/features/admin/queryKeys'

export interface StageTrendSeries {
  /** month labels, oldest first — the last one is the current month */
  months: Array<string>
  counts: Record<Stage, Array<number>>
}

interface TrendRow {
  month_start: string
  stage: string
  disciples: number
}

const EMPTY: StageTrendSeries = {
  months: [],
  counts: { 'New Believer': [], Growing: [], Leader: [] },
}

/** Live: replayed from stage_transitions. Demo: the seeded history, so the
 *  prototype chart keeps telling its story. */
export function useStageTrend(months = 6): Result<StageTrendSeries> {
  const supabase = getSupabase()
  const { data: disciples } = useDisciples('all')

  const query = useQuery({
    queryKey: adminKeys.stageTrend(months),
    queryFn: async (): Promise<StageTrendSeries> => {
      const client = supabase as NonNullable<typeof supabase>
      const { data, error } = await client
        .schema('discipleship')
        .rpc('stage_trend', { p_months: months })
      if (error) throw error
      const rows: Array<TrendRow> = data

      const monthKeys = [...new Set(rows.map((r) => r.month_start))].sort()
      const counts: Record<Stage, Array<number>> = {
        'New Believer': [],
        Growing: [],
        Leader: [],
      }
      for (const key of monthKeys) {
        for (const stage of STAGES) {
          const hit = rows.find((r) => r.month_start === key && r.stage === stage)
          counts[stage].push(hit?.disciples ?? 0)
        }
      }
      return {
        months: monthKeys.map((k) => fmtShort(fromISODate(k)).split(' ')[0] ?? k),
        counts,
      }
    },
    enabled: !isDemoMode && Boolean(supabase),
    staleTime: 5 * 60_000,
  })

  const rows = query.data

  return useMemo(() => {
    if (isDemoMode) {
      // the seeded history plus a live current month, so promoting someone in
      // the demo visibly moves the chart
      const label = fmtShort(today()).split(' ')[0] ?? ''
      const counts: Record<Stage, Array<number>> = {
        'New Believer': [],
        Growing: [],
        Leader: [],
      }
      for (const stage of STAGES) {
        counts[stage] = [
          ...STAGE_TREND_HISTORY.counts[stage],
          disciples.filter((d) => d.stage === stage).length,
        ]
      }
      return {
        data: { months: [...STAGE_TREND_HISTORY.months, label], counts },
        isLoading: false,
        error: null,
      }
    }
    return {
      data: rows ?? EMPTY,
      isLoading: query.isPending,
      error: query.error,
    }
  }, [disciples, rows, query.isPending, query.error])
}
