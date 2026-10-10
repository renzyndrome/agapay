/** Who an admin may pick in "Reassign to". Pure logic, no React.
 *
 *  Any active member may become a discipler (a discipler is simply whoever a
 *  member points at via discipler_id), so the list is the current disciplers
 *  first, then every other member. Excluded: the members being moved, and
 *  anyone further down their line of care, since that would close a loop
 *  (A walks with B while B walks with A). */

export interface ReassignCandidate {
  id: string
  name: string
}

export interface ReassignMember extends ReassignCandidate {
  disciplerId: string | null
}

export interface ReassignTargetsInput {
  /** current disciplers, in display order */
  disciplers: ReadonlyArray<ReassignCandidate>
  /** active directory members; empty when not loaded */
  members: ReadonlyArray<ReassignMember>
  /** member ids of the disciples being moved */
  movingMemberIds: ReadonlyArray<string>
}

export interface ReassignTargets {
  disciplers: Array<ReassignCandidate>
  others: Array<ReassignCandidate>
}

// Guard against bad data: a line of care deeper than this is not walked.
const MAX_LINE_DEPTH = 50

export function reassignTargets({
  disciplers,
  members,
  movingMemberIds,
}: ReassignTargetsInput): ReassignTargets {
  const moving = new Set(movingMemberIds)
  const disciplerOf = new Map(members.map((m) => [m.id, m.disciplerId]))

  // Walk up from the candidate. Meeting a moved member means the candidate is
  // that member (or sits below them), so picking it would close a loop.
  const isBlocked = (candidateId: string): boolean => {
    const seen = new Set<string>()
    let current: string | null = candidateId
    for (let depth = 0; current && depth < MAX_LINE_DEPTH; depth += 1) {
      if (moving.has(current)) return true
      if (seen.has(current)) return false
      seen.add(current)
      current = disciplerOf.get(current) ?? null
    }
    return false
  }

  const disciplerIds = new Set(disciplers.map((d) => d.id))
  const toCandidate = ({ id, name }: ReassignCandidate): ReassignCandidate => ({
    id,
    name,
  })

  return {
    disciplers: disciplers.filter((d) => !isBlocked(d.id)).map(toCandidate),
    others: members
      .filter((m) => !disciplerIds.has(m.id) && !isBlocked(m.id))
      .map(toCandidate)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}
