-- ============================================================================
-- Discipleship: link an existing directory member as a disciple, and close a
-- hole in add_disciple.
--
-- 1. add_disciple's guard was NULL-unsafe. For a caller with no linked member
--    (anon, or an account not yet linked) current_member_id() is null, so
--    `not (false or p_discipler_member = null)` is NULL and the IF never
--    raised. anon also held EXECUTE, so the public anon key could insert
--    public.members rows. The guard now compares with IS NOT DISTINCT FROM,
--    requires a signed-in discipler (or an admin), and a name. city is NOT NULL
--    in production, so a missing city is stored as '' (as the directory does).
-- 2. link_disciple(member): a discipler takes an existing member who has no
--    discipler, instead of creating a duplicate record with add_disciple. Sets
--    members.discipler_id (one of the two directory columns Agapay may write)
--    and enrolls the member the way add_disciple and the import script do.
-- 3. Write RPCs: EXECUTE revoked from PUBLIC and anon; authenticated only.
--
-- Rollback: supabase/rollbacks/20260927064701_discipleship_link_disciple_down.sql
-- ============================================================================

-- A discipler is whoever an active member points at via discipler_id. Same rule
-- as the app's resolveRole (the client counts members it can read, which RLS
-- limits to non-archived rows).
create or replace function discipleship.is_discipler(p_member uuid) returns boolean
language sql stable security definer set search_path = discipleship, public as $$
  select p_member is not null and exists (
    select 1 from public.members
    where discipler_id = p_member and not coalesce(is_archived, false)
  );
$$;

-- ── add_disciple: NULL-safe guard, name required, city defaults to '' ───────
create or replace function discipleship.add_disciple(
  p_name text, p_city text, p_stage_db text, p_discipler_member uuid, p_cohort text
) returns uuid
language plpgsql security definer set search_path = discipleship, public as $$
declare
  v_me uuid := discipleship.current_member_id();
  v_member uuid;
  v_disciple uuid;
begin
  if not (discipleship.is_agapay_admin()
          or (v_me is not null
              and p_discipler_member is not distinct from v_me
              and discipleship.is_discipler(v_me))) then
    raise exception 'Not authorized to add a disciple for this discipler';
  end if;
  if p_discipler_member is null then
    raise exception 'A discipler is required';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'A name is required';
  end if;

  insert into public.members (name, city, discipleship_stage, discipler_id, membership_status, joined_date)
  values (btrim(p_name), coalesce(btrim(p_city), ''), p_stage_db, p_discipler_member, 'active', current_date)
  returning id into v_member;

  insert into discipleship.disciple_profiles (member_id, cohort)
  values (v_member, p_cohort) returning id into v_disciple;

  perform discipleship.snapshot_checklist(v_disciple, p_stage_db);

  insert into discipleship.stage_transitions (disciple_id, from_stage, to_stage, note, created_by)
  values (v_disciple, null, p_stage_db, 'Joined Agapay', auth.uid());

  return v_disciple;
end;
$$;

-- ── link_disciple: a discipler takes an unassigned directory member ─────────
-- Returns the disciple_profiles id. Idempotent for a member already linked to
-- the caller. Never moves a member away from another discipler (admins use
-- reassign_disciples for that).
create or replace function discipleship.link_disciple(p_member uuid) returns uuid
language plpgsql security definer set search_path = discipleship, public as $$
declare
  v_me uuid := discipleship.current_member_id();
  v_stage text;
  v_discipler uuid;
  v_archived boolean;
  v_disciple uuid;
begin
  if v_me is null or not discipleship.is_discipler(v_me) then
    raise exception 'Only a discipler can add a disciple';
  end if;

  select discipleship_stage, discipler_id, coalesce(is_archived, false)
    into v_stage, v_discipler, v_archived
    from public.members where id = p_member
    for update;
  if not found or v_archived then
    raise exception 'Member not found';
  end if;
  if p_member = v_me then
    raise exception 'Own member record cannot be added';
  end if;
  if v_discipler is not null and v_discipler <> v_me then
    raise exception 'Already walks with another discipler. An admin can reassign.';
  end if;

  -- No loops: the member must not be the caller's discipler, directly or
  -- further up the line.
  if exists (
    with recursive line(member_id, depth) as (
      select m.discipler_id, 1 from public.members m
      where m.id = v_me and m.discipler_id is not null
      union all
      select m.discipler_id, l.depth + 1 from public.members m
      join line l on m.id = l.member_id
      where m.discipler_id is not null and l.depth < 50
    )
    select 1 from line where member_id = p_member
  ) then
    raise exception 'Member already disciples this account';
  end if;

  update public.members set discipler_id = v_me, updated_at = now()
  where id = p_member and discipler_id is null;

  select id into v_disciple from discipleship.disciple_profiles where member_id = p_member;
  if v_disciple is null then
    insert into discipleship.disciple_profiles (member_id)
    values (p_member) returning id into v_disciple;

    perform discipleship.snapshot_checklist(v_disciple, v_stage);

    insert into discipleship.stage_transitions (disciple_id, from_stage, to_stage, note, created_by)
    values (v_disciple, null, v_stage, 'Joined Agapay', auth.uid());
  end if;

  return v_disciple;
end;
$$;

-- ── grants: signed-in callers only ──────────────────────────────────────────
revoke execute on function
  discipleship.is_discipler(uuid),
  discipleship.add_disciple(text, text, text, uuid, text),
  discipleship.link_disciple(uuid),
  discipleship.promote_disciple(uuid, text),
  discipleship.reassign_disciples(uuid[], uuid)
from public, anon;

grant execute on function
  discipleship.is_discipler(uuid),
  discipleship.add_disciple(text, text, text, uuid, text),
  discipleship.link_disciple(uuid),
  discipleship.promote_disciple(uuid, text),
  discipleship.reassign_disciples(uuid[], uuid)
to authenticated, service_role;
