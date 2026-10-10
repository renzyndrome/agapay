import { describe, expect, it } from 'vitest'
import { isAfterDay } from '#/lib/format'

describe('isAfterDay', () => {
  const day = new Date(2026, 9, 9, 23, 30) // Oct 9, late evening, local time

  it('is false for the same day and earlier', () => {
    expect(isAfterDay('2026-10-09', day)).toBe(false)
    expect(isAfterDay('2026-10-08', day)).toBe(false)
    expect(isAfterDay('2025-12-31', day)).toBe(false)
  })

  it('is true for any later day', () => {
    expect(isAfterDay('2026-10-10', day)).toBe(true)
    expect(isAfterDay('2027-01-01', day)).toBe(true)
  })

  it('reads the day in local time, not UTC', () => {
    const earlyMorning = new Date(2026, 9, 10, 0, 15)
    expect(isAfterDay('2026-10-10', earlyMorning)).toBe(false)
  })
})
