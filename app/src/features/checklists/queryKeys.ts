export const checklistKeys = {
  all: ['checklists'] as const,
  master: () => [...checklistKeys.all, 'master'] as const,
}
