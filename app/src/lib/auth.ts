/** Pure auth/role logic — no React, no network, fully unit-testable.
 *
 *  Agapay does NOT require a `discipleship` role grant. A discipler is whoever
 *  another member points at via `members.discipler_id`. That matters for
 *  security: production's `is_leader_or_admin()` includes 'discipleship', so
 *  granting that role would also hand the user direct UPDATE on public.members
 *  and let them bypass the promote/reassign audit trail (design/GAPS.md #33).
 *  Only Agapay admins need an actual role — `user_profiles.role = 'admin'`.
 */

/** The subset of public.user_profiles Agapay reads. */
export interface DirectoryProfile {
  id: string
  member_id: string | null
  role: string
  /** false = deactivated: no Agapay access. null/absent reads as active,
   *  matching the database's coalesce(is_active, true). */
  is_active?: boolean | null
}

export type NoAccessReason =
  | 'no-profile'
  | 'no-member-link'
  | 'no-disciples'
  | 'inactive'

export type AgapayRole =
  /** memberId: the admin's own member record, when the account is linked.
   *  An admin who also walks with disciples needs it for "mine" and adding. */
  | { kind: 'admin'; memberId: string | null }
  | { kind: 'discipler'; memberId: string; discipleCount: number }
  | { kind: 'no-access'; reason: NoAccessReason }

export interface RoleInput {
  profile: DirectoryProfile | null
  /** rows in public.members where discipler_id = profile.member_id */
  discipleCount: number
}

export function resolveRole({ profile, discipleCount }: RoleInput): AgapayRole {
  if (!profile) return { kind: 'no-access', reason: 'no-profile' }
  // Checked before the role: a deactivated admin has no access either.
  if (profile.is_active === false) return { kind: 'no-access', reason: 'inactive' }
  if (profile.role === 'admin') return { kind: 'admin', memberId: profile.member_id }
  if (!profile.member_id) return { kind: 'no-access', reason: 'no-member-link' }
  if (discipleCount > 0) {
    return { kind: 'discipler', memberId: profile.member_id, discipleCount }
  }
  return { kind: 'no-access', reason: 'no-disciples' }
}

/** The signed-in user's own member id: a discipler's, or a linked admin's.
 *  Null for an unlinked admin and for no-access. */
export function memberIdOf(role: AgapayRole): string | null {
  if (role.kind === 'discipler' || role.kind === 'admin') return role.memberId
  return null
}

/** Where a signed-in user belongs after login. */
export function landingPath(role: AgapayRole): string {
  if (role.kind === 'admin') return '/admin'
  if (role.kind === 'discipler') return '/'
  return '/no-access'
}

/** May this role render the given route tree? */
export function canAccess(role: AgapayRole, tree: 'discipler' | 'admin'): boolean {
  if (tree === 'admin') return role.kind === 'admin'
  // Admins may also look at a discipler surface; no-access may not.
  return role.kind === 'discipler' || role.kind === 'admin'
}

/** No-access screen heading. A deactivated account gets its own heading;
 *  every other reason is a step still to come. */
export function noAccessHeading(reason: NoAccessReason, displayName: string): string {
  if (reason === 'inactive') return 'Account deactivated'
  const first = displayName.trim().split(' ')[0]
  return first ? `Almost there, ${first}` : 'Almost there'
}

/** Warm, no-guilt copy for the no-access screen (RULES.md #12). The
 *  deactivated heading already names the state, so its body is the next step. */
export function noAccessMessage(reason: NoAccessReason): string {
  if (reason === 'inactive') {
    return 'Contact a church admin.'
  }
  if (reason === 'no-disciples') {
    return 'No disciples assigned yet. Contact a church leader.'
  }
  if (reason === 'no-member-link') {
    return 'Account not linked to a member record yet. Contact a church leader.'
  }
  return 'No church directory profile for this account yet. Contact a church leader.'
}

/** Supabase auth errors are terse; keep the UI warm and specific. */
export function friendlySignInError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) {
    return 'Email address or password incorrect.'
  }
  if (m.includes('email not confirmed')) {
    return 'Email address not confirmed. Open the invite email first.'
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Server unreachable. Check the connection and retry.'
  }
  return message
}
