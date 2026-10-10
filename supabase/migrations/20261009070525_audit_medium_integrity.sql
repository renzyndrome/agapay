-- ============================================================================
-- Audit fixes, Medium (2026-10-09).
--
-- 1. reassign_disciples(disciples, to_member, circle): validated and atomic.
--    - Admin only (unchanged). Target must exist and not be archived.
--    - No loops: the target cannot be one of the moved members or anyone
--      below them in the line of care (self-discipling is also a CHECK).
--    - Every id must be a live disciple, or nothing moves.
--    - Circle in the same transaction: with p_circle, each disciple joins it
--      (the target must lead or co-lead it) and leaves other plain
--      memberships. Without p_circle, each disciple leaves plain memberships
--      in circles the target does not run, so discipler and circle agree.
--    Signature gains p_circle (default null); two-argument calls still work.
-- 2. place_in_circle: the disciple's discipler must lead or co-lead the circle,
--    for admins too (an admin reassigns first).
-- 3. link_disciple refuses:
--    - a member who is a plain member of a circle the caller does not run
--      (an admin moves them), and
--    - pastors (leadership_level Pastor / Head Pastor): an admin assigns them.
-- 4. promote_disciple: locks the member row (two simultaneous taps cannot
--    promote twice) and takes an optional expected current stage; a mismatch
--    means the stage changed meanwhile and nothing is written.
--    Signature gains p_from_stage_db (default null); two-argument calls work.
-- 5. activity_logs: an activity cannot be dated after tomorrow (Manila).
-- 6. create_circle: serialized per name and satellite (advisory lock), so a
--    double tap cannot create two circles with the same name.
--
-- Rollback: supabase/rollbacks/20261009070525_audit_medium_integrity_down.sql
-- ============================================================================

-- ── 1. reassign_disciples ───────────────────────────────────────────────────
-- The two-argument version is replaced by one with an optional circle.
drop function if exists discipleship.reassign_disciples(uuid[], uuid);

create or replace function discipleship.reassign_disciples(
  p_disciples uuid[], p_to_member uuid, p_circle uuid default null
) returns int
language plpgsql security definer set search_path = discipleship, public as $$
declare
  v_ids uuid[];
  v_members uuid[];
  v_found int;
  v_leader uuid;
  v_co_leader uuid;
  v_count int;
begin
  if not discipleship.is_agapay_admin() then
    raise exception 'Only an admin can reassign disciples';
  end if;
  if p_to_member is null or not exists (
       select 1 from public.members where id = p_to_member and not coalesce(is_archived, false)) then
    raise exception 'Discipler not found. Pick another discipler.';
  end if;

  select array_agg(distinct x) into v_ids
    from unnest(coalesce(p_disciples, '{}'::uuid[])) as x where x is not null;
  if v_ids is null then
    raise exception 'No disciples selected';
  end if;

  select array_agg(dp.member_id), count(*) into v_members, v_found
    from discipleship.disciple_profiles dp
    join public.members m on m.id = dp.member_id
   where dp.id = any(v_ids) and not coalesce(m.is_archived, false);
  if v_found <> array_length(v_ids, 1) then
    raise exception 'Some disciples not found. Refresh and retry.';
  end if;

  -- No loops: walk up from the target; meeting a moved member means the
  -- target is that member or sits below them.
  if exists (
    with recursive line(member_id, depth) as (
      select p_to_member, 0
      union all
      select m.discipler_id, l.depth + 1
        from public.members m join line l on m.id = l.member_id
       where m.discipler_id is not null and l.depth < 50
    )
    select 1 from line where member_id = any(v_members)
  ) then
    raise exception 'That move makes a loop. Pick a discipler outside this line.';
  end if;

  if p_circle is not null then
    select leader_id, co_leader_id into v_leader, v_co_leader
      from public.cell_groups where id = p_circle and coalesce(is_active, true);
    if not found then
      raise exception 'Circle not found';
    end if;
    if not (v_leader is not distinct from p_to_member or v_co_leader is not distinct from p_to_member) then
      raise exception 'Circle not run by that discipler. Pick one of their circles.';
    end if;
    if v_leader = any(v_members) or v_co_leader = any(v_members) then
      raise exception 'Circle leaders cannot join as members';
    end if;
  end if;

  update public.members set discipler_id = p_to_member, updated_at = now()
   where id = any(v_members);
  get diagnostics v_count = row_count;

  if p_circle is not null then
    update public.member_cell_groups
       set is_active = false, left_at = now()
     where member_id = any(v_members) and role = 'member'
       and cell_group_id <> p_circle and coalesce(is_active, true);

    insert into public.member_cell_groups (member_id, cell_group_id, role, is_active, joined_at, left_at)
    select mid, p_circle, 'member', true, now(), null from unnest(v_members) as mid
    on conflict (member_id, cell_group_id) do update
      set is_active = true, left_at = null,
          joined_at = case when coalesce(public.member_cell_groups.is_active, true)
                           then public.member_cell_groups.joined_at else now() end;
  else
    update public.member_cell_groups x
       set is_active = false, left_at = now()
      from public.cell_groups g
     where g.id = x.cell_group_id
       and x.member_id = any(v_members) and x.role = 'member'
       and coalesce(x.is_active, true)
       and g.leader_id is distinct from p_to_member
       and g.co_leader_id is distinct from p_to_member;
  end if;

  return v_count;
end;
$$;

-- ── 2. place_in_circle: the discipler must run the circle, admins included ──
create or replace function discipleship.place_in_circle(p_disciple uuid, p_circle uuid)
returns void
language plpgsql security definer set search_path = discipleship, public as $$
declare
  v_me uuid := discipleship.current_member_id();
  v_admin boolean := coalesce(discipleship.is_agapay_admin(), false);
  v_member uuid;
  v_discipler uuid;
  v_leader uuid;
  v_co_leader uuid;
  v_other_name text;
begin
  select dp.member_id, m.discipler_id into v_member, v_discipler
    from discipleship.disciple_profiles dp
    join public.members m on m.id = dp.member_id
   where dp.id = p_disciple and not coalesce(m.is_archived, false);
  if v_member is null then
    raise exception 'Disciple not found';
  end if;

  select leader_id, co_leader_id into v_leader, v_co_leader
    from public.cell_groups
   where id = p_circle and coalesce(is_active, true);
  if not found then
    raise exception 'Circle not found';
  end if;

  if not (v_admin or (
        v_me is not null
        and v_discipler is not distinct from v_me
        and (v_leader is not distinct from v_me or v_co_leader is not distinct from v_me))) then
    raise exception 'Not authorized to place this disciple in this circle';
  end if;

  -- Discipler and circle agree, whoever places them.
  if v_discipler is null or not (v_leader is not distinct from v_discipler
                                 or v_co_leader is not distinct from v_discipler) then
    raise exception 'Circle not run by this disciple''s discipler. Reassign first.';
  end if;

  if v_member is not distinct from v_leader or v_member is not distinct from v_co_leader then
    raise exception 'Circle leaders cannot join as members';
  end if;

  select cg.name into v_other_name
    from public.member_cell_groups mcg
    join public.cell_groups cg on cg.id = mcg.cell_group_id
   where mcg.member_id = v_member
     and mcg.cell_group_id <> p_circle
     and mcg.role = 'member'
     and coalesce(mcg.is_active, true)
     and coalesce(cg.is_active, true)
     and not (v_admin or (
           v_me is not null
           and (cg.leader_id is not distinct from v_me
                or cg.co_leader_id is not distinct from v_me)))
   order by cg.name
   limit 1;
  if v_other_name is not null then
    raise exception 'Already in %. Remove from that circle first.', v_other_name;
  end if;

  update public.member_cell_groups
     set is_active = false, left_at = now()
   where member_id = v_member
     and role = 'member'
     and cell_group_id <> p_circle
     and coalesce(is_active, true);

  insert into public.member_cell_groups (member_id, cell_group_id, role, is_active, joined_at, left_at)
  values (v_member, p_circle, 'member', true, now(), null)
  on conflict (member_id, cell_group_id) do update
    set is_active = true,
        left_at = null,
        joined_at = case
          when coalesce(public.member_cell_groups.is_active, true)
            then public.member_cell_groups.joined_at
          else now()
        end;
end;
$$;

-- ── 3. link_disciple: not from another leader's circle, not pastors ─────────
create or replace function discipleship.link_disciple(p_member uuid) returns uuid
language plpgsql security definer set search_path = discipleship, public as $$
declare
  v_me uuid := discipleship.current_member_id();
  v_stage text;
  v_discipler uuid;
  v_archived boolean;
  v_level text;
  v_other_name text;
  v_disciple uuid;
begin
  if v_me is null or not discipleship.is_discipler(v_me) then
    raise exception 'Only a discipler can add a disciple';
  end if;

  select discipleship_stage, discipler_id, coalesce(is_archived, false), leadership_level
    into v_stage, v_discipler, v_archived, v_level
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
  if v_discipler is null and v_level in ('Pastor', 'Head Pastor') then
    raise exception 'Pastors are assigned by an admin.';
  end if;

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

  -- A plain member of a circle the caller does not run stays with that
  -- circle until an admin moves them.
  if v_discipler is null then
    select cg.name into v_other_name
      from public.member_cell_groups mcg
      join public.cell_groups cg on cg.id = mcg.cell_group_id
     where mcg.member_id = p_member and mcg.role = 'member'
       and coalesce(mcg.is_active, true) and coalesce(cg.is_active, true)
       and cg.leader_id is distinct from v_me
       and cg.co_leader_id is distinct from v_me
     order by cg.name limit 1;
    if v_other_name is not null then
      raise exception 'In %. An admin can move them.', v_other_name;
    end if;
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

-- ── 4. promote_disciple: locked, with an optional expected stage ────────────
-- The two-argument version is replaced by one with an optional stage check.
drop function if exists discipleship.promote_disciple(uuid, text);

create or replace function discipleship.promote_disciple(
  p_disciple uuid, p_note text, p_from_stage_db text default null
) returns void
language plpgsql security definer set search_path = discipleship, public as $$
declare
  v_member uuid;
  v_cur text;
  v_next text;
begin
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'A note is required to promote';
  end if;
  if not discipleship.can_access_disciple(p_disciple) then
    raise exception 'Not authorized to promote this disciple';
  end if;

  select member_id into v_member from discipleship.disciple_profiles where id = p_disciple;
  if v_member is null then raise exception 'Disciple not found'; end if;

  -- Row lock: a second, simultaneous promote waits here, then sees the new stage.
  select discipleship_stage into v_cur from public.members where id = v_member for update;
  if p_from_stage_db is not null and v_cur is distinct from p_from_stage_db then
    raise exception 'Stage already changed. Refresh to see it.';
  end if;
  v_next := discipleship.next_db_stage(v_cur);
  if v_next is null then raise exception 'Already at the highest stage'; end if;

  update public.members set discipleship_stage = v_next, updated_at = now()
  where id = v_member;

  insert into discipleship.stage_transitions (disciple_id, from_stage, to_stage, note, created_by)
  values (p_disciple, v_cur, v_next, p_note, auth.uid());

  perform discipleship.snapshot_checklist(p_disciple, v_next);
end;
$$;

-- ── 5. no activity dated after tomorrow (Manila) ────────────────────────────
create or replace function discipleship.guard_activity_date() returns trigger
language plpgsql security invoker set search_path = discipleship, public as $$
begin
  if new.occurred_on > discipleship.manila_today() + 1 then
    raise exception 'Activity date in the future. Pick today or earlier.'
      using errcode = '22007';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_activity_date_guard on discipleship.activity_logs;
create trigger trg_activity_date_guard
  before insert or update of occurred_on on discipleship.activity_logs
  for each row execute function discipleship.guard_activity_date();

revoke execute on function discipleship.guard_activity_date() from public, anon;

-- ── 6. create_circle: serialized per name + satellite ───────────────────────
create or replace function discipleship.create_circle(p_name text) returns uuid
language plpgsql security definer set search_path = discipleship, public as $$
declare
  v_me uuid := discipleship.current_member_id();
  v_name text := btrim(coalesce(p_name, ''));
  v_satellite uuid;
  v_circle uuid;
begin
  if v_me is null or not discipleship.is_discipler(v_me) then
    raise exception 'Only a discipler can start a circle';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'Circle name must be 2 to 60 characters';
  end if;

  select satellite_id into v_satellite from public.members where id = v_me;

  -- Two calls with the same name in the same satellite run one at a time.
  perform pg_advisory_xact_lock(hashtext('create_circle:' || lower(v_name) || ':' || coalesce(v_satellite::text, '')));

  if exists (
    select 1 from public.cell_groups
    where coalesce(is_active, true)
      and lower(btrim(name)) = lower(v_name)
      and satellite_id is not distinct from v_satellite
  ) then
    raise exception 'Circle name already in use';
  end if;

  insert into public.cell_groups (name, satellite_id, leader_id, is_active)
  values (v_name, v_satellite, v_me, true)
  returning id into v_circle;

  return v_circle;
end;
$$;

-- ── grants: signed-in callers only ──────────────────────────────────────────
revoke execute on function
  discipleship.reassign_disciples(uuid[], uuid, uuid),
  discipleship.promote_disciple(uuid, text, text)
from public, anon;
grant execute on function
  discipleship.reassign_disciples(uuid[], uuid, uuid),
  discipleship.promote_disciple(uuid, text, text)
to authenticated, service_role;
