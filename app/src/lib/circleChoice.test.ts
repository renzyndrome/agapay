import { describe, expect, it } from 'vitest'
import {
  CHOOSE_CIRCLE_HINT,
  EMPTY_CIRCLE_DRAFT,
  PENDING_CIRCLE_HINT,
  circleHoldHint,
  circleListStatus,
  circlesRunBy,
  hasPendingCircleName,
  primaryCircleOf,
  resolveCircleChoice,
  withStarted,
} from '#/lib/circleChoice'

const circles = [
  { id: 'c1', name: 'Tribes', leaderDisciplerId: 'ana', coLeaderId: null },
  { id: 'c2', name: 'Chosen', leaderDisciplerId: 'ben', coLeaderId: 'ana' },
  { id: 'c3', name: 'Souldiers', leaderDisciplerId: 'ben', coLeaderId: null },
]

describe('circlesRunBy', () => {
  it('lists circles the member leads or co-leads', () => {
    expect(circlesRunBy(circles, 'ana').map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(circlesRunBy(circles, 'ben').map((c) => c.id)).toEqual(['c2', 'c3'])
  })

  it('lists nothing for no member', () => {
    expect(circlesRunBy(circles, null)).toEqual([])
    expect(circlesRunBy(circles, 'zed')).toEqual([])
  })
})

describe('resolveCircleChoice', () => {
  const one = circles.slice(0, 1)
  const two = circles.slice(0, 2)

  it('no circles: nothing to ask, the choice is none', () => {
    expect(resolveCircleChoice([], undefined)).toEqual({
      value: null,
      needsChoice: false,
    })
  })

  it('one circle: it is picked for the leader', () => {
    expect(resolveCircleChoice(one, undefined)).toEqual({
      value: 'c1',
      needsChoice: false,
    })
  })

  it('two or more circles: the leader must choose', () => {
    expect(resolveCircleChoice(two, undefined)).toEqual({
      value: undefined,
      needsChoice: true,
    })
  })

  it('an explicit pick wins, including none', () => {
    expect(resolveCircleChoice(two, 'c2')).toEqual({
      value: 'c2',
      needsChoice: false,
    })
    expect(resolveCircleChoice(two, null)).toEqual({
      value: null,
      needsChoice: false,
    })
  })

  it('a pick that is no longer offered falls back to the default', () => {
    expect(resolveCircleChoice(one, 'c3')).toEqual({
      value: 'c1',
      needsChoice: false,
    })
    expect(resolveCircleChoice(two, 'c3')).toEqual({
      value: undefined,
      needsChoice: true,
    })
  })
})

describe('circleListStatus', () => {
  it('is ready once loaded with no error', () => {
    expect(circleListStatus(false, null)).toBe('ready')
  })

  it('is loading while the first load runs', () => {
    expect(circleListStatus(true, null)).toBe('loading')
  })

  it('reports an error ahead of loading', () => {
    expect(circleListStatus(false, new Error('offline'))).toBe('error')
    expect(circleListStatus(true, new Error('offline'))).toBe('error')
  })
})

describe('withStarted', () => {
  const started = {
    id: 'c9',
    name: 'New',
    leaderDisciplerId: 'ana',
    coLeaderId: null,
  }

  it('keeps a just-started circle the list does not show yet', () => {
    const mine = circlesRunBy(circles, 'ana')
    expect(withStarted(mine, [started]).map((c) => c.id)).toEqual([
      'c1',
      'c2',
      'c9',
    ])
  })

  it('does not repeat a started circle once the list has it', () => {
    const listed = [...circles, started]
    expect(withStarted(listed, [started]).map((c) => c.id)).toEqual([
      'c1',
      'c2',
      'c3',
      'c9',
    ])
  })

  it('a kept started circle stays the choice instead of "No circle"', () => {
    const choice = resolveCircleChoice(withStarted([], [started]), 'c9')
    expect(choice).toEqual({ value: 'c9', needsChoice: false })
    // without it the pick falls back to none
    expect(resolveCircleChoice([], 'c9')).toEqual({
      value: null,
      needsChoice: false,
    })
  })
})

describe('hasPendingCircleName', () => {
  it('holds only while the New circle field is open with a name typed', () => {
    expect(hasPendingCircleName(EMPTY_CIRCLE_DRAFT)).toBe(false)
    expect(hasPendingCircleName({ creating: true, name: '' })).toBe(false)
    expect(hasPendingCircleName({ creating: true, name: '   ' })).toBe(false)
    expect(hasPendingCircleName({ creating: true, name: 'Test' })).toBe(true)
    expect(hasPendingCircleName({ creating: false, name: 'Test' })).toBe(false)
  })
})

describe('circleHoldHint', () => {
  it('asks to start or clear a typed name before anything else', () => {
    expect(circleHoldHint(true, { creating: true, name: 'Test' })).toBe(
      PENDING_CIRCLE_HINT,
    )
    expect(circleHoldHint(false, { creating: true, name: 'Test' })).toBe(
      PENDING_CIRCLE_HINT,
    )
  })

  it('asks for a choice when one is needed, even with the field open', () => {
    expect(circleHoldHint(true, EMPTY_CIRCLE_DRAFT)).toBe(CHOOSE_CIRCLE_HINT)
    expect(circleHoldHint(true, { creating: true, name: '' })).toBe(
      CHOOSE_CIRCLE_HINT,
    )
  })

  it('is null when nothing is held', () => {
    expect(circleHoldHint(false, EMPTY_CIRCLE_DRAFT)).toBeNull()
    expect(circleHoldHint(false, { creating: true, name: ' ' })).toBeNull()
  })
})

describe('primaryCircleOf', () => {
  const groups = [
    { id: 'g1', name: 'Zeta', leaderDisciplerId: 'm1', coLeaderId: null },
    { id: 'g2', name: 'Alpha', leaderDisciplerId: 'm1', coLeaderId: 'm2' },
    { id: 'g3', name: 'Beta', leaderDisciplerId: 'm3', coLeaderId: 'm2' },
    { id: 'g4', name: 'Aardvark', leaderDisciplerId: 'm4', coLeaderId: 'm1' },
  ]

  it('picks the first led circle by name', () => {
    expect(primaryCircleOf(groups, 'm1')).toBe('g2')
  })

  it('falls back to the first co-led circle by name', () => {
    expect(primaryCircleOf(groups, 'm2')).toBe('g2')
  })

  it('prefers a led circle over an earlier co-led one', () => {
    expect(primaryCircleOf(groups, 'm4')).toBe('g4')
    expect(
      primaryCircleOf(
        [
          { id: 'a', name: 'A', leaderDisciplerId: 'x', coLeaderId: 'm5' },
          { id: 'b', name: 'B', leaderDisciplerId: 'm5', coLeaderId: null },
        ],
        'm5',
      ),
    ).toBe('b')
  })

  it('is null for no member or no circle', () => {
    expect(primaryCircleOf(groups, null)).toBeNull()
    expect(primaryCircleOf(groups, 'm9')).toBeNull()
    expect(primaryCircleOf([], 'm1')).toBeNull()
  })

  it('leaves the given list in its order', () => {
    const copy = [...groups]
    primaryCircleOf(groups, 'm1')
    expect(groups).toEqual(copy)
  })
})
