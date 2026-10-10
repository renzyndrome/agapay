import { describe, expect, it } from 'vitest'
import { UNKNOWN_DISCIPLE, visibleMeetings } from '#/lib/visibleMeetings'

const disciples = [
  { id: 'd1', name: 'Test One' },
  { id: 'd2', name: 'Test Two' },
]

describe('visibleMeetings', () => {
  it('keeps only meetings of listed disciples, in order', () => {
    const meetings = [
      { id: 'a', discipleId: 'd2', discipleName: '' },
      { id: 'b', discipleId: 'gone', discipleName: '' },
      { id: 'c', discipleId: 'd1', discipleName: '' },
    ]
    expect(visibleMeetings(meetings, disciples).map((m) => m.id)).toEqual([
      'a',
      'c',
    ])
  })

  it('names each meeting from the current list', () => {
    const [m] = visibleMeetings(
      [{ id: 'a', discipleId: 'd1', discipleName: 'Old Name' }],
      disciples,
    )
    expect(m.discipleName).toBe('Test One')
  })

  it('reads an empty name as unknown', () => {
    const [m] = visibleMeetings(
      [{ id: 'a', discipleId: 'd3' }],
      [{ id: 'd3', name: '' }],
    )
    expect(m.discipleName).toBe(UNKNOWN_DISCIPLE)
  })

  it('shows nothing until the disciple list loads', () => {
    expect(
      visibleMeetings([{ id: 'a', discipleId: 'd1', discipleName: '' }], []),
    ).toEqual([])
  })

  it('leaves the input untouched', () => {
    const meetings = [{ id: 'a', discipleId: 'd1', discipleName: '' }]
    visibleMeetings(meetings, disciples)
    expect(meetings[0].discipleName).toBe('')
  })
})
