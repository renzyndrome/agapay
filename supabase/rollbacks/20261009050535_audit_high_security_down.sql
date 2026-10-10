-- ============================================================================
-- Rollback for supabase/migrations/20261009050535_audit_high_security.sql
--
-- WARNING: restores the holes the migration closed (self-edit of protected
-- member fields, deactivated accounts keeping Agapay access). Roll back only
-- with a replacement fix ready. Previous definitions are also in the live
-- backup: tierra/data/backups/2026-10-09_pre-audit-fixes/schema-definitions.sql
-- ============================================================================

drop trigger if exists trg_members_guard_fields on public.members;
drop function if exists discipleship.guard_member_fields();

alter table public.members drop constraint if exists members_discipler_not_self;

create or replace function discipleship.is_discipler(p_member uuid) returns boolean
language sql stable security definer set search_path = discipleship, public as $$
  select p_member is not null and exists (
    select 1 from public.members
    where discipler_id = p_member and not coalesce(is_archived, false)
  );
$$;

create or replace function discipleship.current_member_id() returns uuid
language sql stable security definer set search_path = discipleship, public as $$
  select member_id from public.user_profiles where id = auth.uid();
$$;

create or replace function discipleship.is_agapay_admin() returns boolean
language sql stable security definer set search_path = discipleship, public as $$
  select exists (select 1 from public.user_profiles
                 where id = auth.uid() and role = 'admin');
$$;

alter table discipleship.activity_logs drop constraint if exists activity_logs_created_by_fkey;
alter table discipleship.activity_logs
  add constraint activity_logs_created_by_fkey foreign key (created_by) references auth.users(id);
alter table discipleship.meetings drop constraint if exists meetings_created_by_fkey;
alter table discipleship.meetings
  add constraint meetings_created_by_fkey foreign key (created_by) references auth.users(id);
alter table discipleship.stage_transitions drop constraint if exists stage_transitions_created_by_fkey;
alter table discipleship.stage_transitions
  add constraint stage_transitions_created_by_fkey foreign key (created_by) references auth.users(id);
