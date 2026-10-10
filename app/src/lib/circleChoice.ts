/** Which Quest Circle a disciple joins when a discipler is assigned. Pure.
 *
 *  A leader may run several circles. One circle: it is picked for them.
 *  Two or more: they must choose. `null` is the explicit "none" choice
 *  (no circle when adding; when reassigning, disciples leave circles the new
 *  discipler does not run). */

export interface CircleRef {
  id: string
  leaderDisciplerId: string | null
  coLeaderId: string | null
}

/** Circles the member leads or co-leads, in the given order. */
export function circlesRunBy<T extends CircleRef>(
  circles: ReadonlyArray<T>,
  memberId: string | null,
): Array<T> {
  if (!memberId) return []
  return circles.filter(
    (c) => c.leaderDisciplerId === memberId || c.coLeaderId === memberId,
  )
}

export interface CircleChoice {
  /** circle id; null = none; undefined = not chosen yet */
  value: string | null | undefined
  needsChoice: boolean
}

/** pick: undefined = untouched, null = none, else a circle id. */
export function resolveCircleChoice(
  circles: ReadonlyArray<CircleRef>,
  pick: string | null | undefined,
): CircleChoice {
  if (pick === null) return { value: null, needsChoice: false }
  if (pick !== undefined && circles.some((c) => c.id === pick)) {
    return { value: pick, needsChoice: false }
  }
  if (circles.length === 0) return { value: null, needsChoice: false }
  if (circles.length === 1) return { value: circles[0].id, needsChoice: false }
  return { value: undefined, needsChoice: true }
}

/** Whether the circle list can be trusted yet. Until it is 'ready', any
 *  add or reassign that depends on it stays blocked. */
export type CircleListStatus = 'loading' | 'error' | 'ready'

export function circleListStatus(
  isLoading: boolean,
  error: unknown,
): CircleListStatus {
  if (error) return 'error'
  if (isLoading) return 'loading'
  return 'ready'
}

/** The listed circles plus circles started in this sheet that the refetched
 *  list does not show yet, so a just-started circle stays chosen. */
export function withStarted<T extends CircleRef>(
  circles: ReadonlyArray<T>,
  started: ReadonlyArray<T>,
): Array<T> {
  const listed = new Set(circles.map((c) => c.id))
  return [...circles, ...started.filter((c) => !listed.has(c.id))]
}

/** The "New circle" field: open or closed, and what is typed in it. */
export interface CircleDraft {
  creating: boolean
  name: string
}

export const EMPTY_CIRCLE_DRAFT: CircleDraft = { creating: false, name: '' }

export const CHOOSE_CIRCLE_HINT = 'Choose a Quest Circle first.'
export const PENDING_CIRCLE_HINT = 'Start the circle or clear the name.'

/** A typed but unstarted circle name holds every add, so the name is never
 *  dropped without a word. */
export function hasPendingCircleName(draft: CircleDraft): boolean {
  return draft.creating && draft.name.trim().length > 0
}

/** The hint for a held add, or null when the circle choice holds nothing. */
export function circleHoldHint(
  needsChoice: boolean,
  draft: CircleDraft,
): string | null {
  if (hasPendingCircleName(draft)) return PENDING_CIRCLE_HINT
  if (needsChoice) return CHOOSE_CIRCLE_HINT
  return null
}

interface NamedCircleRef extends CircleRef {
  name: string
}

function firstByName<T extends NamedCircleRef>(
  circles: ReadonlyArray<T>,
): T | null {
  return [...circles].sort((a, b) => a.name.localeCompare(b.name))[0] ?? null
}

/** The one circle shown for a discipler: the first they lead, by name; a
 *  co-led circle only when they lead none. Null for neither. */
export function primaryCircleOf<T extends NamedCircleRef>(
  circles: ReadonlyArray<T>,
  memberId: string | null,
): string | null {
  if (!memberId) return null
  const led = firstByName(
    circles.filter((c) => c.leaderDisciplerId === memberId),
  )
  if (led) return led.id
  return (
    firstByName(circles.filter((c) => c.coLeaderId === memberId))?.id ?? null
  )
}
