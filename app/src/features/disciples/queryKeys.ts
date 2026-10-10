export const discipleKeys = {
  all: ['disciples'] as const,
  list: () => [...discipleKeys.all, 'list'] as const,
  detail: (id: string) => [...discipleKeys.all, 'detail', id] as const,
  timeline: (id: string) => [...discipleKeys.detail(id), 'timeline'] as const,
  checklist: (id: string) => [...discipleKeys.detail(id), 'checklist'] as const,
  milestones: (id: string) => [...discipleKeys.detail(id), 'milestones'] as const,
  attendance: (id: string) => [...discipleKeys.detail(id), 'attendance'] as const,
}
