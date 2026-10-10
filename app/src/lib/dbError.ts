/** Toast text for a failed database call. Pure, no React.
 *
 *  Only messages the database functions write as product copy reach the
 *  screen: RAISE EXCEPTION text (P0001), the protected-member-fields guard
 *  (42501 with its own prefix) and the date guard (22007). Everything else
 *  (permission denied, expired session, network, constraint names) shows the
 *  caller's fallback instead of the raw message. */

/** SQLSTATE codes whose message is written for people. */
const PRODUCT_COPY_CODES: ReadonlySet<string> = new Set(['P0001', '22007'])
const PERMISSION_CODE = '42501'
const PROTECTED_FIELDS_PREFIX = 'Protected member fields'

/** Generic fallback when a caller has nothing more specific. */
export const SAVE_FAILED = 'Save failed. Retry.'

function textField(error: unknown, key: 'code' | 'message'): string {
  if (typeof error !== 'object' || error === null) return ''
  const value = (error as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

/** True when the error's own message is safe to show as written. */
export function isProductDbError(error: unknown): boolean {
  const code = textField(error, 'code')
  const message = textField(error, 'message')
  if (!message) return false
  if (PRODUCT_COPY_CODES.has(code)) return true
  return code === PERMISSION_CODE && message.startsWith(PROTECTED_FIELDS_PREFIX)
}

export function friendlyDbError(error: unknown, fallback: string): string {
  return isProductDbError(error) ? textField(error, 'message') : fallback
}
