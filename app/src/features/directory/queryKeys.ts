export const directoryKeys = {
  all: ['directory'] as const,
  disciplers: () => [...directoryKeys.all, 'disciplers'] as const,
  lifeGroups: () => [...directoryKeys.all, 'life-groups'] as const,
  unassigned: () => [...directoryKeys.all, 'unassigned'] as const,
  search: () => [...directoryKeys.all, 'search'] as const,
}
