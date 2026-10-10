/** Toast copy for saved actions, shared by the live mutations and the demo
 *  store so both modes read the same. Pure, no React. System register:
 *  past-tense fragments, no pronouns, no questions, no em dashes. */

export const MEETING_COMPLETED = 'Meeting completed.'
export const MEETING_CANCELLED = 'Meeting cancelled.'
export const MEETING_NOSHOW = 'Marked no-show.'
export const PROMOTE_NOTE_REQUIRED = 'Note required to promote.'

/** First word of a full name; '' when there is none. */
export function firstNameOf(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? ''
}

/** "One-on-one logged for Ana." */
export function loggedToast(
  type: string,
  name: string | null | undefined,
): string {
  const first = firstNameOf(name)
  return first ? `${type} logged for ${first}.` : `${type} logged.`
}

/** "Meeting scheduled." or "Meeting scheduled. Repeats weekly." */
export function scheduledToast(recurrence: string): string {
  return recurrence === 'none'
    ? 'Meeting scheduled.'
    : `Meeting scheduled. Repeats ${recurrence}.`
}

/** "Promoted to Growing." when the new stage is known. */
export function promotedToast(stage: string | null | undefined): string {
  return stage ? `Promoted to ${stage}.` : 'Promoted.'
}

/** circleReason: null = no circle step failed; '' = it failed with no
 *  reason fit to show; else the reason. */
export function addedToast(name: string, circleReason: string | null): string {
  const first = firstNameOf(name) || 'Disciple'
  if (circleReason === null) return `${first} added to Disciples.`
  return circleReason
    ? `${first} added. Quest Circle not set: ${circleReason}`
    : `${first} added. Quest Circle not set.`
}
