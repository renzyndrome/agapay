/** Engagement thresholds — config constants, never hardcoded in components
 *  (RULES.md #17). Healthy ≤ amber; Cooling ≤ red; At-risk > red. */
export const ENGAGEMENT = {
  amberAfterDays: 14,
  redAfterDays: 28,
} as const

export type EngagementKey = 'green' | 'amber' | 'red'

export interface EngagementInfo {
  key: EngagementKey
  label: 'Healthy' | 'Cooling' | 'At-risk'
  dot: string
  bg: string
  fg: string
}

const GREEN: EngagementInfo = {
  key: 'green',
  label: 'Healthy',
  dot: 'var(--color-green)',
  bg: 'var(--color-green-tint)',
  fg: 'var(--color-green)',
}
const AMBER: EngagementInfo = {
  key: 'amber',
  label: 'Cooling',
  dot: 'var(--color-amber)',
  bg: 'var(--color-amber-tint)',
  fg: 'var(--color-amber-text)',
}
const RED: EngagementInfo = {
  key: 'red',
  label: 'At-risk',
  dot: 'var(--color-brand)',
  bg: 'var(--color-rose)',
  fg: 'var(--color-maroon)',
}

export function engagement(days: number): EngagementInfo {
  if (days > ENGAGEMENT.redAfterDays) return RED
  if (days > ENGAGEMENT.amberAfterDays) return AMBER
  return GREEN
}
