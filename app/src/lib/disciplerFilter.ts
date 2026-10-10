/** The admin Disciples table's discipler filter. Pure, no React.
 *
 *  An enrolled disciple whose member record points at no discipler is in no
 *  follow-up queue, so the filter has a "No discipler" choice to find them.
 *  Live rows map a null discipler_id to '', so both read as "none". */

/** Filter value for "every discipler". */
export const ALL_DISCIPLERS = 'all'
/** Filter value (and ?discipler= search value) for "No discipler". */
export const NO_DISCIPLER = 'none'

export function hasNoDiscipler(
  disciplerId: string | null | undefined,
): boolean {
  return !disciplerId
}

export function matchesDisciplerFilter(
  disciplerId: string | null | undefined,
  filter: string,
): boolean {
  if (filter === ALL_DISCIPLERS) return true
  if (filter === NO_DISCIPLER) return hasNoDiscipler(disciplerId)
  return disciplerId === filter
}

export interface AdminDisciplesSearch {
  /** NO_DISCIPLER or a discipler's member id; absent = every discipler */
  discipler?: string
}

/** validateSearch for /admin/disciples: keeps a non-empty ?discipler= value
 *  and drops anything else. */
export function parseAdminDisciplesSearch(
  search: Record<string, unknown>,
): AdminDisciplesSearch {
  const raw = search.discipler
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value && value !== ALL_DISCIPLERS ? { discipler: value } : {}
}

/** A filter value the refetched options no longer include reads as "all".
 *  The fixed values (all, none) always stay. Until the options are loaded
 *  the value is kept, so a deep link survives the first fetch. */
export function availableFilterValue(
  value: string,
  optionIds: ReadonlyArray<string>,
  loaded: boolean,
  fixed: ReadonlyArray<string> = [ALL_DISCIPLERS],
): string {
  if (!loaded || fixed.includes(value) || optionIds.includes(value)) {
    return value
  }
  return ALL_DISCIPLERS
}
