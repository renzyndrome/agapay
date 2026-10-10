-- ============================================================================
-- discipleship_profiles — scoping helpers bound to the directory's own RBAC
-- ----------------------------------------------------------------------------
-- Revised 2026-07-12 after introspecting production: the directory already has
-- `public.user_profiles (id → auth.users, member_id → members, role)`. Agapay
-- therefore keeps NO parallel role table — it reads that one.
--
-- Who is a discipler?  IMPLICIT: whoever another member points at via
-- members.discipler_id. No role grant is required, which is deliberate —
-- production's is_leader_or_admin() includes 'discipleship', so granting that
-- role would also hand the user direct UPDATE on public.members and let them
-- bypass Agapay's promote/reassign audit trail. Disciplers should keep
-- role='member'; only Agapay admins need role='admin'. (NOTES.md, GAPS #33)
-- ============================================================================

-- caller's directory member id — no role filter, so a plain 'member' works.
-- security definer → reads user_profiles without recursing through its RLS.
create or replace function discipleship.current_member_id() returns uuid
language sql stable security definer set search_path = discipleship, public as $$
  select member_id from public.user_profiles where id = auth.uid();
$$;

-- Agapay admin = directory admin.
create or replace function discipleship.is_agapay_admin() returns boolean
language sql stable security definer set search_path = discipleship, public as $$
  select exists (select 1 from public.user_profiles
                 where id = auth.uid() and role = 'admin');
$$;

-- now that is_agapay_admin() exists, gate settings writes to admins
drop policy if exists settings_write_admin on discipleship.settings;
create policy settings_write_admin on discipleship.settings
  for update using (discipleship.is_agapay_admin()) with check (discipleship.is_agapay_admin());
grant update on discipleship.settings to authenticated;
