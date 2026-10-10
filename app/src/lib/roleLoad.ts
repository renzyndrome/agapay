/** Reads who a signed-in user is, using ONLY directory tables that already
 *  exist in production, so auth works before the discipleship migrations
 *  land. Any failed read throws: a network blip must never read as "no
 *  profile" or "no disciples" and lock a user out. */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DirectoryProfile, RoleInput } from '#/lib/auth'

export interface RoleInputs extends RoleInput {
  /** the linked member's name; empty when unlinked */
  memberName: string
}

export async function fetchRoleInputs(
  supabase: SupabaseClient,
  userId: string,
): Promise<RoleInputs> {
  const { data: profileRow, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, member_id, role, is_active')
    .eq('id', userId)
    .maybeSingle()
  if (profileError) throw profileError

  const profile = (profileRow as DirectoryProfile | null) ?? null
  if (!profile?.member_id) {
    return { profile, discipleCount: 0, memberName: '' }
  }

  const [countResult, memberResult] = await Promise.all([
    supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('discipler_id', profile.member_id),
    supabase
      .from('members')
      .select('name')
      .eq('id', profile.member_id)
      .maybeSingle(),
  ])
  if (countResult.error) throw countResult.error
  if (memberResult.error) throw memberResult.error

  return {
    profile,
    discipleCount: countResult.count ?? 0,
    memberName: (memberResult.data as { name?: string } | null)?.name ?? '',
  }
}
