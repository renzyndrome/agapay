import { describe, expect, it } from 'vitest'
import {
  disciplesLabel,
  movedCount,
  namesList,
  reassignConfirmText,
  reassignOutcome,
} from '#/lib/reassignOutcome'

describe('disciplesLabel', () => {
  it('uses the singular for one', () => {
    expect(disciplesLabel(1)).toBe('1 disciple')
    expect(disciplesLabel(0)).toBe('0 disciples')
    expect(disciplesLabel(3)).toBe('3 disciples')
  })
})

describe('reassignConfirmText', () => {
  it('names the count and the target', () => {
    expect(reassignConfirmText(3, 'Test Discipler')).toBe(
      'Move 3 disciples to Test Discipler.',
    )
    expect(reassignConfirmText(1, 'Test Discipler')).toBe(
      'Move 1 disciple to Test Discipler.',
    )
  })
})

describe('movedCount', () => {
  it('trusts the count the RPC returns', () => {
    expect(movedCount(2, 3)).toBe(2)
    expect(movedCount(0, 3)).toBe(0)
  })

  it('falls back to the requested count when the RPC returns no number', () => {
    expect(movedCount(null, 3)).toBe(3)
    expect(movedCount('2', 3)).toBe(3)
    expect(movedCount(Number.NaN, 3)).toBe(3)
  })
})

describe('namesList', () => {
  it('lists one, two, or the first two and a count', () => {
    expect(namesList([])).toBe('')
    expect(namesList(['A'])).toBe('A')
    expect(namesList(['A', 'B'])).toBe('A and B')
    expect(namesList(['A', 'B', 'C'])).toBe('A, B and 1 more')
    expect(namesList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B and 3 more')
  })
})

describe('reassignOutcome', () => {
  it('reports a complete move with the returned count', () => {
    expect(reassignOutcome({ requested: 3, moved: 3 })).toEqual({
      complete: true,
      toast: '3 disciples reassigned.',
    })
    expect(reassignOutcome({ requested: 1, moved: 1 }).toast).toBe(
      '1 disciple reassigned.',
    )
  })

  it('reports a short move as incomplete, with the next step', () => {
    expect(reassignOutcome({ requested: 3, moved: 2 })).toEqual({
      complete: false,
      toast: '2 of 3 disciples reassigned. Refresh and retry.',
    })
  })

  it('reports a move that touched nobody', () => {
    expect(reassignOutcome({ requested: 1, moved: 0 }).toast).toBe(
      '0 of 1 disciple reassigned. Refresh and retry.',
    )
  })

  it('names who the Quest Circle refusal touched', () => {
    const outcome = reassignOutcome({
      requested: 2,
      moved: 2,
      circleFailures: [
        { name: 'Test One', reason: 'Circle not found' },
        { name: 'Test Two', reason: 'Circle not found' },
      ],
    })
    expect(outcome.complete).toBe(true)
    expect(outcome.toast).toBe(
      '2 disciples reassigned. Quest Circle not set for Test One and Test Two: Circle not found',
    )
  })

  it('shortens a long refusal list and drops a hidden reason', () => {
    const outcome = reassignOutcome({
      requested: 5,
      moved: 5,
      circleFailures: ['A', 'B', 'C', 'D'].map((n) => ({
        name: `Test ${n}`,
        reason: '',
      })),
    })
    expect(outcome.toast).toBe(
      '5 disciples reassigned. Quest Circle not set for Test A, Test B and 2 more.',
    )
  })

  it('never uses an em dash or a question', () => {
    const toasts = [
      reassignOutcome({ requested: 3, moved: 3 }).toast,
      reassignOutcome({ requested: 3, moved: 1 }).toast,
      reassignConfirmText(2, 'Test Discipler'),
    ]
    for (const t of toasts) expect(t).not.toMatch(/[—?]/)
  })
})
