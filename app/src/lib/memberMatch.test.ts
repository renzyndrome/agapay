import { describe, expect, it } from 'vitest'
import {
  findInitialsMatches,
  findSurnameMatches,
  nameMatchConfidence,
  normalizeName,
  searchByName,
  splitInitials,
  suggestMembers,
  trigramSimilarity,
} from '#/lib/memberMatch'

const people = [
  { id: '1', name: 'Juan Carlos Ilagan' },
  { id: '2', name: 'Justin Ilagan' },
  { id: '3', name: 'Maria Ilagan' },
  { id: '4', name: 'Ramon Dela Cruz' },
  { id: '5', name: 'John Smith' },
  { id: '6', name: 'Sarah Jane Romero' },
  { id: '7', name: 'José Peña' },
]

describe('normalizeName', () => {
  it('strips accents, punctuation and extra spaces', () => {
    expect(normalizeName('  José  Cruz-Reyes! ')).toBe('jose cruz reyes')
  })
})

describe('searchByName', () => {
  it('matches every typed word in any order, accent-insensitive', () => {
    expect(searchByName('ilagan maria', people).map((m) => m.id)).toEqual([
      '3',
    ])
    expect(searchByName('pena', people).map((m) => m.id)).toEqual(['7'])
  })

  it('ranks names starting with the query first', () => {
    expect(searchByName('Ju', people).map((m) => m.id)).toEqual(['1', '2'])
  })

  it('returns nothing for an empty query', () => {
    expect(searchByName('  ', people)).toEqual([])
  })
})

describe('splitInitials', () => {
  it('reads "JC", "J.C." and 3 consonants as initials', () => {
    expect(splitInitials('JC Ilagan')).toEqual({
      initials: 'jc',
      rest: ['ilagan'],
    })
    expect(splitInitials('J.C.')).toEqual({ initials: 'jc', rest: [] })
    expect(splitInitials('MJC')).toEqual({ initials: 'mjc', rest: [] })
  })

  it('ignores ordinary first names', () => {
    expect(splitInitials('Justin Ilagan')).toBeNull()
    expect(splitInitials('Jan Reyes')).toBeNull()
  })
})

describe('findInitialsMatches', () => {
  it('finds leading-name initials plus the other typed words', () => {
    expect(findInitialsMatches('JC Ilagan', people).map((m) => m.id)).toEqual([
      '1',
    ])
    expect(findInitialsMatches('SJ Romero', people).map((m) => m.id)).toEqual([
      '6',
    ])
  })
})

describe('findSurnameMatches', () => {
  it('finds everyone with the typed surname', () => {
    expect(findSurnameMatches('Bong Cruz', people).map((m) => m.id)).toEqual([
      '4',
    ])
    expect(findSurnameMatches('JC Ilagan', people).map((m) => m.id)).toEqual([
      '1',
      '2',
      '3',
    ])
  })

  it('needs a first word and a surname of 3+ letters', () => {
    expect(findSurnameMatches('Ilagan', people)).toEqual([])
  })
})

describe('trigramSimilarity', () => {
  it('scores a typo high and an unrelated name low', () => {
    expect(trigramSimilarity('Jhon Smit', 'John Smith')).toBeGreaterThan(0.3)
    expect(trigramSimilarity('Jhon Smit', 'Maria Ilagan')).toBeLessThan(0.1)
  })
})

describe('nameMatchConfidence', () => {
  it('scores a dropped middle name as a confident match', () => {
    expect(nameMatchConfidence('Sarah Romero', 'Sarah Jane Romero')).toBe(0.9)
  })
})

describe('suggestMembers', () => {
  it('ranks the initials match first for "JC Ilagan"', () => {
    const out = suggestMembers('JC Ilagan', people, new Set())
    expect(out[0].member.id).toBe('1')
    expect(out[0].reasons).toEqual(['initials', 'surname'])
    expect(out.map((s) => s.member.id)).toContain('2')
  })

  it('catches a typo as a similar name', () => {
    const out = suggestMembers('Jhon Smit', people, new Set())
    expect(out[0]).toMatchObject({ member: { id: '5' }, reasons: ['similar'] })
  })

  it('skips members already listed as results', () => {
    expect(suggestMembers('Jhon Smit', people, new Set(['5']))).toEqual([])
  })

  it('suggests nothing for a 1-letter query', () => {
    expect(suggestMembers('J', people, new Set())).toEqual([])
  })
})
