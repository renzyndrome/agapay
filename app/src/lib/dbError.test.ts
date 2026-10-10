import { describe, expect, it } from 'vitest'
import { SAVE_FAILED, friendlyDbError, isProductDbError } from '#/lib/dbError'

const FALLBACK = 'Save failed. Retry.'

describe('friendlyDbError', () => {
  it('shows RAISE EXCEPTION text from the database functions', () => {
    expect(
      friendlyDbError(
        { code: 'P0001', message: 'Already walks with another discipler' },
        FALLBACK,
      ),
    ).toBe('Already walks with another discipler')
  })

  it('shows the protected-member-fields guard', () => {
    const message = 'Protected member fields change only through Agapay.'
    expect(friendlyDbError({ code: '42501', message }, FALLBACK)).toBe(message)
  })

  it('shows the date guard', () => {
    expect(
      friendlyDbError(
        { code: '22007', message: 'Activity date in the future.' },
        FALLBACK,
      ),
    ).toBe('Activity date in the future.')
  })

  it('hides any other permission error', () => {
    expect(
      friendlyDbError(
        { code: '42501', message: 'permission denied for table members' },
        FALLBACK,
      ),
    ).toBe(FALLBACK)
  })

  it('hides expired sessions, constraint names and network failures', () => {
    const raw = [
      { code: 'PGRST301', message: 'JWT expired' },
      {
        code: '23505',
        message: 'duplicate key value violates unique constraint "x_key"',
      },
      { message: 'TypeError: Failed to fetch' },
      { code: '', message: 'Failed to fetch' },
      new Error('network down'),
    ]
    for (const error of raw)
      expect(friendlyDbError(error, FALLBACK)).toBe(FALLBACK)
  })

  it('falls back for missing, empty or malformed errors', () => {
    expect(friendlyDbError(null, FALLBACK)).toBe(FALLBACK)
    expect(friendlyDbError(undefined, FALLBACK)).toBe(FALLBACK)
    expect(friendlyDbError('P0001', FALLBACK)).toBe(FALLBACK)
    expect(friendlyDbError({ code: 'P0001', message: '  ' }, FALLBACK)).toBe(
      FALLBACK,
    )
    expect(friendlyDbError({ code: 'P0001', message: 42 }, FALLBACK)).toBe(
      FALLBACK,
    )
  })

  it('trims the message it shows', () => {
    expect(
      friendlyDbError(
        { code: 'P0001', message: ' Member not found ' },
        FALLBACK,
      ),
    ).toBe('Member not found')
  })
})

describe('isProductDbError', () => {
  it('accepts only product-copy codes', () => {
    expect(isProductDbError({ code: 'P0001', message: 'x' })).toBe(true)
    expect(isProductDbError({ code: '42501', message: 'denied' })).toBe(false)
    expect(isProductDbError({ code: 'XX000', message: 'x' })).toBe(false)
  })

  it('exports a generic fallback in the system register', () => {
    expect(SAVE_FAILED).toBe('Save failed. Retry.')
  })
})
