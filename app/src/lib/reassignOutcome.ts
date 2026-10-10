/** Copy and counts for the admin bulk reassign. Pure, no React. */

export function disciplesLabel(count: number): string {
  return `${count} disciple${count === 1 ? '' : 's'}`
}

/** The inline confirm shown before a bulk move runs. */
export function reassignConfirmText(count: number, targetName: string): string {
  return `Move ${disciplesLabel(count)} to ${targetName}.`
}

/** The reassign_disciples RPC returns how many members it moved. A missing
 *  or malformed count falls back to the number requested. */
export function movedCount(data: unknown, requested: number): number {
  return typeof data === 'number' && Number.isFinite(data) ? data : requested
}

/** Names for a toast: "A", "A and B", or "A, B and 3 more". */
export function namesList(names: ReadonlyArray<string>): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`
}

/** A disciple whose Quest Circle step was refused. reason: '' when no
 *  reason is fit to show. */
export interface CircleFailure {
  name: string
  reason: string
}

export interface ReassignOutcomeInput {
  requested: number
  moved: number
  /** one entry per disciple whose Quest Circle step was refused */
  circleFailures?: ReadonlyArray<CircleFailure>
}

export interface ReassignOutcome {
  /** every requested disciple was moved */
  complete: boolean
  toast: string
}

export function reassignOutcome({
  requested,
  moved,
  circleFailures = [],
}: ReassignOutcomeInput): ReassignOutcome {
  if (moved < requested) {
    return {
      complete: false,
      toast: `${moved} of ${disciplesLabel(requested)} reassigned. Refresh and retry.`,
    }
  }
  const done = `${disciplesLabel(moved)} reassigned.`
  if (circleFailures.length === 0) return { complete: true, toast: done }
  const who = namesList(circleFailures.map((f) => f.name))
  const reason = circleFailures.find((f) => f.reason)?.reason
  return {
    complete: true,
    toast: reason
      ? `${done} Quest Circle not set for ${who}: ${reason}`
      : `${done} Quest Circle not set for ${who}.`,
  }
}
