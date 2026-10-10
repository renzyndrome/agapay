import { describe, expect, it } from 'vitest'
import {
  MEETING_CANCELLED,
  MEETING_COMPLETED,
  MEETING_NOSHOW,
  PROMOTE_NOTE_REQUIRED,
  addedToast,
  firstNameOf,
  loggedToast,
  promotedToast,
  scheduledToast,
} from '#/lib/outcomeCopy'

describe('firstNameOf', () => {
  it('takes the first word', () => {
    expect(firstNameOf('Test Person')).toBe('Test')
    expect(firstNameOf('  Test   Person ')).toBe('Test')
  })

  it('is empty for no name', () => {
    expect(firstNameOf('')).toBe('')
    expect(firstNameOf(null)).toBe('')
    expect(firstNameOf(undefined)).toBe('')
  })
})

describe('outcome toasts', () => {
  it('names the activity and the disciple', () => {
    expect(loggedToast('One-on-one', 'Test Person')).toBe(
      'One-on-one logged for Test.',
    )
    expect(loggedToast('Note', '')).toBe('Note logged.')
  })

  it('reports a schedule and its repeat', () => {
    expect(scheduledToast('none')).toBe('Meeting scheduled.')
    expect(scheduledToast('weekly')).toBe('Meeting scheduled. Repeats weekly.')
  })

  it('names the new stage when known', () => {
    expect(promotedToast('Growing')).toBe('Promoted to Growing.')
    expect(promotedToast(null)).toBe('Promoted.')
  })

  it('reports an add with or without the circle step', () => {
    expect(addedToast('Test Person', null)).toBe('Test added to Disciples.')
    expect(addedToast('Test Person', 'Circle not found')).toBe(
      'Test added. Quest Circle not set: Circle not found',
    )
    expect(addedToast('Test Person', '')).toBe(
      'Test added. Quest Circle not set.',
    )
  })

  it('never uses an em dash, a question, please or a pronoun', () => {
    const all = [
      MEETING_COMPLETED,
      MEETING_CANCELLED,
      MEETING_NOSHOW,
      PROMOTE_NOTE_REQUIRED,
      loggedToast('Life Group', 'Test Person'),
      scheduledToast('biweekly'),
      promotedToast('Leader'),
      addedToast('Test Person', ''),
    ]
    for (const t of all) {
      expect(t).not.toMatch(/[—?!]/)
      expect(t).not.toMatch(/\b(please|you|your|we|our|us|I|me)\b/i)
    }
  })
})
