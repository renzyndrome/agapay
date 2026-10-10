import { describe, expect, it } from 'vitest'
import {
  ALL_DISCIPLERS,
  NO_DISCIPLER,
  availableFilterValue,
  hasNoDiscipler,
  matchesDisciplerFilter,
  parseAdminDisciplesSearch,
} from '#/lib/disciplerFilter'

describe('hasNoDiscipler', () => {
  it('reads null, undefined and the empty string as none', () => {
    expect(hasNoDiscipler(null)).toBe(true)
    expect(hasNoDiscipler(undefined)).toBe(true)
    expect(hasNoDiscipler('')).toBe(true)
    expect(hasNoDiscipler('m1')).toBe(false)
  })
})

describe('matchesDisciplerFilter', () => {
  it('lets every row through for all disciplers', () => {
    expect(matchesDisciplerFilter('m1', ALL_DISCIPLERS)).toBe(true)
    expect(matchesDisciplerFilter('', ALL_DISCIPLERS)).toBe(true)
  })

  it('keeps only rows with no discipler for the none filter', () => {
    expect(matchesDisciplerFilter('', NO_DISCIPLER)).toBe(true)
    expect(matchesDisciplerFilter(null, NO_DISCIPLER)).toBe(true)
    expect(matchesDisciplerFilter('m1', NO_DISCIPLER)).toBe(false)
  })

  it('matches one discipler by id', () => {
    expect(matchesDisciplerFilter('m1', 'm1')).toBe(true)
    expect(matchesDisciplerFilter('m2', 'm1')).toBe(false)
    expect(matchesDisciplerFilter('', 'm1')).toBe(false)
  })
})

describe('parseAdminDisciplesSearch', () => {
  it('keeps the none filter', () => {
    expect(parseAdminDisciplesSearch({ discipler: 'none' })).toEqual({
      discipler: NO_DISCIPLER,
    })
  })

  it('keeps a discipler id, trimmed', () => {
    expect(parseAdminDisciplesSearch({ discipler: ' m1 ' })).toEqual({
      discipler: 'm1',
    })
  })

  it('drops missing, empty, all and non-string values', () => {
    expect(parseAdminDisciplesSearch({})).toEqual({})
    expect(parseAdminDisciplesSearch({ discipler: '' })).toEqual({})
    expect(parseAdminDisciplesSearch({ discipler: 'all' })).toEqual({})
    expect(parseAdminDisciplesSearch({ discipler: 42 })).toEqual({})
    expect(parseAdminDisciplesSearch({ discipler: ['none'] })).toEqual({})
  })
})

describe('availableFilterValue', () => {
  const fixed = [ALL_DISCIPLERS, NO_DISCIPLER]

  it('keeps a value the options still offer', () => {
    expect(availableFilterValue('m1', ['m1', 'm2'], true, fixed)).toBe('m1')
  })

  it('resets a value the refetched options dropped', () => {
    expect(availableFilterValue('m3', ['m1', 'm2'], true, fixed)).toBe(
      ALL_DISCIPLERS,
    )
    expect(availableFilterValue('c9', [], true)).toBe(ALL_DISCIPLERS)
  })

  it('always keeps the fixed values', () => {
    expect(availableFilterValue(NO_DISCIPLER, [], true, fixed)).toBe(
      NO_DISCIPLER,
    )
    expect(availableFilterValue(ALL_DISCIPLERS, [], true, fixed)).toBe(
      ALL_DISCIPLERS,
    )
  })

  it('treats none as an option only where it is fixed', () => {
    expect(availableFilterValue(NO_DISCIPLER, ['c1'], true)).toBe(
      ALL_DISCIPLERS,
    )
  })

  it('keeps any value until the options load', () => {
    expect(availableFilterValue('m3', [], false, fixed)).toBe('m3')
  })
})
