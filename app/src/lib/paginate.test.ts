import { describe, expect, it } from 'vitest'
import { paginate } from '#/lib/paginate'

describe('paginate', () => {
  it('slices the first page', () => {
    expect(paginate(174, 0, 25)).toEqual({
      page: 0,
      pageCount: 7,
      start: 0,
      end: 25,
    })
  })

  it('ends the last page at the total', () => {
    expect(paginate(174, 6, 25)).toMatchObject({ start: 150, end: 174 })
  })

  it('clamps a page past the end to the last page', () => {
    expect(paginate(30, 9, 25)).toMatchObject({ page: 1, start: 25, end: 30 })
  })

  it('clamps a negative page to the first page', () => {
    expect(paginate(30, -2, 25)).toMatchObject({ page: 0, start: 0 })
  })

  it('keeps one empty page when nothing matches', () => {
    expect(paginate(0, 3, 25)).toEqual({
      page: 0,
      pageCount: 1,
      start: 0,
      end: 0,
    })
  })
})
