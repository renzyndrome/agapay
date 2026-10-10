import { describe, expect, it } from 'vitest'
import { reassignTargets } from '#/lib/reassignTargets'

// Line of care: A disciples B, B disciples C. D and E walk with no one.
const members = [
  { id: 'A', name: 'Ana Cruz', disciplerId: null },
  { id: 'B', name: 'Ben Reyes', disciplerId: 'A' },
  { id: 'C', name: 'Carl Santos', disciplerId: 'B' },
  { id: 'D', name: 'Dina Lopez', disciplerId: null },
  { id: 'E', name: 'Eli Bautista', disciplerId: null },
]
const disciplers = [
  { id: 'A', name: 'Ana Cruz' },
  { id: 'B', name: 'Ben Reyes' },
]

const ids = (list: Array<{ id: string }>) => list.map((x) => x.id)

describe('reassignTargets', () => {
  it('lists current disciplers first, then every other member by name', () => {
    const t = reassignTargets({ disciplers, members, movingMemberIds: ['C'] })
    expect(ids(t.disciplers)).toEqual(['A', 'B'])
    expect(ids(t.others)).toEqual(['D', 'E'])
  })

  it('never offers a member being moved as their own discipler', () => {
    const t = reassignTargets({ disciplers, members, movingMemberIds: ['D'] })
    expect(ids(t.others)).not.toContain('D')
  })

  it('blocks loops: nobody further down the line of a moved member', () => {
    // Moving A: B (A's disciple) and C (B's disciple) would close a loop.
    const t = reassignTargets({ disciplers, members, movingMemberIds: ['A'] })
    expect(ids(t.disciplers)).toEqual([])
    expect(ids(t.others)).toEqual(['D', 'E'])
  })

  it('keeps the current discipler as a valid target', () => {
    const t = reassignTargets({ disciplers, members, movingMemberIds: ['B'] })
    expect(ids(t.disciplers)).toEqual(['A'])
  })

  it('offers only disciplers when no directory list is loaded', () => {
    const t = reassignTargets({
      disciplers,
      members: [],
      movingMemberIds: ['C'],
    })
    expect(ids(t.disciplers)).toEqual(['A', 'B'])
    expect(t.others).toEqual([])
  })

  it('survives a loop already in the data', () => {
    const looped = [
      { id: 'X', name: 'Xia', disciplerId: 'Y' },
      { id: 'Y', name: 'Yul', disciplerId: 'X' },
      { id: 'Z', name: 'Zed', disciplerId: null },
    ]
    const t = reassignTargets({
      disciplers: [],
      members: looped,
      movingMemberIds: ['Z'],
    })
    expect(ids(t.others)).toEqual(['X', 'Y'])
  })
})
