export const meetingKeys = {
  all: ['meetings'] as const,
  list: () => [...meetingKeys.all, 'list'] as const,
  forDisciple: (id: string) => [...meetingKeys.all, 'disciple', id] as const,
}
