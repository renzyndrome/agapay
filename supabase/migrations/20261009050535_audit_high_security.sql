-- ============================================================================
-- Audit fixes, High (2026-10-09).
--
-- 1. Protected member fields. members_update_self lets a signed-in member
--    update ANY column of their own row, and members_insert_admin lets
--    leader roles insert rows directly. A member could set their own
--    discipler_id (becoming a "discipler"), stage, leadership level, status,
--    satellite or archive flag. A BEFORE INSERT/UPDATE trigger now refuses
--    those changes from browser sessions (roles anon / authenticated) unless
--    the caller is a directory admin. Unaffected: the directory app's server
--    (service_role) and Agapay's SECURITY DEFINER functions (run as owner).
--    Ordinary self-edits (name, phone, photo, ...) still work.
-- 2. No self-discipling: CHECK (discipler_id <> id), and is_discipler()
--    ignores a self-reference.
-- 3. Deactivated accounts: current_member_id() and is_agapay_admin() now
--    require user_profiles.is_active. Every Agapay policy and RPC builds on
--    these two, so a deactivated account loses Agapay access at once.
-- 4. Deleting a user: created_by on activity_logs, meetings and
--    stage_transitions referenced auth.users with NO ACTION, so the
--    directory's "Remove user" failed for anyone who had logged in Agapay.
--    Now ON DELETE SET NULL (the row stays, the author becomes unknown).
--
-- Rollback: supabase/rollbacks/20261009050535_audit_high_security_down.sql
-- ============================================================================

-- ── 1. protected member fields ──────────────────────────────────────────────
create or replace function discipleship.guard_member_fields() returns trigger
language plpgsql security invoker set search_path = public, discipleship as $$
begin
  -- Only browser sessions are limited. service_role (directory server) and
  -- the SECURITY DEFINER functions (current_user = owner) pass through.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if coalesce(public.is_admin(), false) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.discipler_id is not null
       or coalesce(new.is_archived, false)
       or coalesce(new.leadership_level, 'Member') <> 'Member' then
      raise exception 'Protected member fields. Set them in the directory app or Agapay.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.discipler_id is distinct from old.discipler_id
     or new.discipleship_stage is distinct from old.discipleship_stage
     or new.leadership_level is distinct from old.leadership_level
     or new.membership_status is distinct from old.membership_status
     or new.satellite_id is distinct from old.satellite_id
     or new.is_archived is distinct from old.is_archived then
    raise exception 'Protected member fields. Set them in the directory app or Agapay.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_members_guard_fields on public.members;
create trigger trg_members_guard_fields
  before insert or update on public.members
  for each row execute function discipleship.guard_member_fields();

revoke execute on function discipleship.guard_member_fields() from public, anon;

-- ── 2. no self-discipling ───────────────────────────────────────────────────
alter table public.members drop constraint if exists members_discipler_not_self;
alter table public.members
  add constraint members_discipler_not_self
  check (discipler_id is null or discipler_id <> id) not valid;
-- Validate only when no existing row breaks it (0 on 2026-10-09).
do $$
begin
  if not exists (select 1 from public.members where discipler_id = id) then
    alter table public.members validate constraint members_discipler_not_self;
  end if;
end $$;

create or replace function discipleship.is_discipler(p_member uuid) returns boolean
language sql stable security definer set search_path = discipleship, public as $$
  select p_member is not null and exists (
    select 1 from public.members
    where discipler_id = p_member
      and id <> p_member
      and not coalesce(is_archived, false)
  );
$$;

-- ── 3. deactivated accounts lose Agapay access ──────────────────────────────
create or replace function discipleship.current_member_id() returns uuid
language sql stable security definer set search_path = discipleship, public as $$
  select member_id from public.user_profiles
  where id = auth.uid() and coalesce(is_active, true);
$$;

create or replace function discipleship.is_agapay_admin() returns boolean
language sql stable security definer set search_path = discipleship, public as $$
  select exists (select 1 from public.user_profiles
                 where id = auth.uid() and role = 'admin' and coalesce(is_active, true));
$$;

-- ── 4. deleting a user keeps the Agapay rows, author unknown ────────────────
alter table discipleship.activity_logs drop constraint if exists activity_logs_created_by_fkey;
alter table discipleship.activity_logs
  add constraint activity_logs_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table discipleship.meetings drop constraint if exists meetings_created_by_fkey;
alter table discipleship.meetings
  add constraint meetings_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table discipleship.stage_transitions drop constraint if exists stage_transitions_created_by_fkey;
alter table discipleship.stage_transitions
  add constraint stage_transitions_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
