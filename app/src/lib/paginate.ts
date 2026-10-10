/** Page window over a list of `total` rows. Pure, no React.
 *  An out-of-range page is clamped, so a filter that shrinks the list never
 *  leaves the table on an empty page. */

export interface PageWindow {
  /** zero-based page actually shown */
  page: number
  /** at least 1, even for an empty list */
  pageCount: number
  /** slice bounds: rows.slice(start, end) */
  start: number
  end: number
}

export function paginate(
  total: number,
  requestedPage: number,
  pageSize: number,
): PageWindow {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(0, requestedPage), pageCount - 1)
  const start = page * pageSize
  return { page, pageCount, start, end: Math.min(start + pageSize, total) }
}
