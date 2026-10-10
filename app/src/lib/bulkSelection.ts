/** Row selection for the admin bulk action bar. Pure, no React.
 *
 *  A tick only counts while its row is in the filtered list, so a bulk move
 *  can never reach a row the admin cannot see. Rows on other pages of the
 *  same filtered list stay ticked: paging reaches them. */

export type PageTickState = 'none' | 'some' | 'all'

/** The selected ids still in the filtered rows, in selection order. */
export function keepVisible(
  selected: ReadonlyArray<string>,
  visibleIds: ReadonlyArray<string>,
): Array<string> {
  const visible = new Set(visibleIds)
  return selected.filter((id) => visible.has(id))
}

/** How many rows of the page are ticked. Drives the "Select page" box. */
export function pageTickState(
  selected: ReadonlyArray<string>,
  pageIds: ReadonlyArray<string>,
): PageTickState {
  if (pageIds.length === 0) return 'none'
  const chosen = new Set(selected)
  const ticked = pageIds.filter((id) => chosen.has(id)).length
  if (ticked === 0) return 'none'
  return ticked === pageIds.length ? 'all' : 'some'
}

/** "Select page": ticks every row of the page, or unticks them all when the
 *  whole page is already ticked. Ticks on other pages are kept. */
export function togglePage(
  selected: ReadonlyArray<string>,
  pageIds: ReadonlyArray<string>,
): Array<string> {
  if (pageTickState(selected, pageIds) === 'all') {
    const page = new Set(pageIds)
    return selected.filter((id) => !page.has(id))
  }
  const chosen = new Set(selected)
  return [...selected, ...pageIds.filter((id) => !chosen.has(id))]
}

/** Ticks or unticks one row. */
export function toggleOne(
  selected: ReadonlyArray<string>,
  id: string,
): Array<string> {
  return selected.includes(id)
    ? selected.filter((x) => x !== id)
    : [...selected, id]
}
