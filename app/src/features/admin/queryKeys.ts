export const adminKeys = {
  all: ['admin'] as const,
  stageTrend: (months: number) => [...adminKeys.all, 'stage-trend', months] as const,
}
