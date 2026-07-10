/** Stage vocabulary. UI always says "New Believer" (design rule) —
 *  Tierra's directory stores 'Newbie' and displays 'New Friends'/'Schooling';
 *  the mapping happens at the data boundary when Supabase is wired in. */
export type Stage = 'New Believer' | 'Growing' | 'Leader'

export const STAGES: ReadonlyArray<Stage> = ['New Believer', 'Growing', 'Leader']

export interface StagePillColors {
  bg: string
  fg: string
}

export function stagePill(stage: Stage): StagePillColors {
  if (stage === 'New Believer')
    return { bg: 'var(--color-rose)', fg: 'var(--color-maroon)' }
  if (stage === 'Growing')
    return { bg: 'var(--color-gold-tint)', fg: 'var(--color-gold-text)' }
  return { bg: 'var(--color-ink-100)', fg: 'var(--color-ink-700)' }
}

/** Funnel card top-border accent per stage. Gold appears ONLY here + Growing pill. */
export function stageBar(stage: Stage): string {
  if (stage === 'New Believer') return 'var(--color-brand)'
  if (stage === 'Growing') return 'var(--color-gold)'
  return 'var(--color-ink-700)'
}

export function nextStage(stage: Stage): Stage | null {
  if (stage === 'New Believer') return 'Growing'
  if (stage === 'Growing') return 'Leader'
  return null
}
