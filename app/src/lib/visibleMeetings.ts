/** Meeting lists show only meetings whose disciple is in the loaded
 *  disciple list. Pure, no React.
 *
 *  A meeting of an archived or no-longer-visible disciple would otherwise
 *  render with a blank name. Names come from the current list at render, so
 *  a cached meeting never keeps a name from an older list. */

export const UNKNOWN_DISCIPLE = 'Unknown disciple'

interface NamedRef {
  id: string
  name: string
}

export function visibleMeetings<T extends { discipleId: string }>(
  meetings: ReadonlyArray<T>,
  disciples: ReadonlyArray<NamedRef>,
): Array<T & { discipleName: string }> {
  const nameById = new Map(disciples.map((d) => [d.id, d.name]))
  return meetings
    .filter((m) => nameById.has(m.discipleId))
    .map((m) => ({
      ...m,
      discipleName: nameById.get(m.discipleId) || UNKNOWN_DISCIPLE,
    }))
}
