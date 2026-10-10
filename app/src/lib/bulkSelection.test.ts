import { describe, expect, it } from 'vitest'
import {
  keepVisible,
  pageTickState,
  toggleOne,
  togglePage,
} from '#/lib/bulkSelection'

describe('keepVisible', () => {
  it('drops ticks the filtered list no longer shows', () => {
    expect(keepVisible(['a', 'b', 'c'], ['c', 'a', 'x'])).toEqual(['a', 'c'])
  })

  it('keeps ticks on other pages of the same filtered list', () => {
    // visibleIds is every filtered row, not just the current page
    const filtered = Array.from({ length: 60 }, (_, i) => `r${i}`)
    expect(keepVisible(['r2', 'r40'], filtered)).toEqual(['r2', 'r40'])
  })

  it('clears everything when nothing matches', () => {
    expect(keepVisible(['a', 'b'], [])).toEqual([])
  })
})

describe('pageTickState', () => {
  it('reads none, some and all', () => {
    expect(pageTickState([], ['a', 'b'])).toBe('none')
    expect(pageTickState(['a'], ['a', 'b'])).toBe('some')
    expect(pageTickState(['b', 'a', 'z'], ['a', 'b'])).toBe('all')
  })

  it('treats an empty page as none', () => {
    expect(pageTickState(['a'], [])).toBe('none')
  })
})

describe('togglePage', () => {
  it('ticks every row of the page and keeps other ticks', () => {
    expect(togglePage(['z'], ['a', 'b'])).toEqual(['z', 'a', 'b'])
  })

  it('completes a partly ticked page without duplicates', () => {
    expect(togglePage(['a'], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('unticks a fully ticked page and keeps other ticks', () => {
    expect(togglePage(['z', 'a', 'b'], ['a', 'b'])).toEqual(['z'])
  })
})

describe('toggleOne', () => {
  it('adds and removes a single row', () => {
    expect(toggleOne(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleOne(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('does not mutate the input', () => {
    const before = ['a']
    toggleOne(before, 'b')
    togglePage(before, ['c'])
    expect(before).toEqual(['a'])
  })
})
