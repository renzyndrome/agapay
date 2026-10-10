-- ============================================================================
-- Rollback for supabase/migrations/20261009070525_audit_medium_integrity.sql
--
-- Restores the live definitions from before the audit fixes (taken from the
-- backup tierra/data/backups/2026-10-09_pre-audit-fixes/schema-definitions.sql):
-- two-argument reassign_disciples and promote_disciple, and the previous
-- place_in_circle, link_disciple and create_circle. Removes the activity
-- date guard. WARNING: brings back the gaps the migration closed.
-- ============================================================================

drop trigger if exists trg_activity_date_guard on discipleship.activity_logs;
drop function if exists discipleship.guard_activity_date();

drop function if exists discipleship.reassign_disciples(uuid[], uuid, uuid);
drop function if exists discipleship.promote_disciple(uuid, text, text);

-- previous: discipleship.create_circle(p_name text)
CREATE OR REPLACE FUNCTION discipleship.create_circle(p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'discipleship', 'public'
AS $function$
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
$function$
;

-- previous: discipleship.link_disciple(p_member uuid)
CREATE OR REPLACE FUNCTION discipleship.link_disciple(p_member uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'discipleship', 'public'
AS $function$
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
$function$
;

-- previous: discipleship.place_in_circle(p_disciple uuid, p_circle uuid)
CREATE OR REPLACE FUNCTION discipleship.place_in_circle(p_disciple uuid, p_circle uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'discipleship', 'public'
AS $function$
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

  -- NULL-safe on purpose: every operand is IS NOT DISTINCT FROM or coalesced.
  if not (v_admin or (
        v_me is not null
        and v_discipler is not distinct from v_me
        and (v_leader is not distinct from v_me or v_co_leader is not distinct from v_me))) then
    raise exception 'Not authorized to place this disciple in this circle';
  end if;

  if v_member is not distinct from v_leader or v_member is not distinct from v_co_leader then
    raise exception 'Circle leaders cannot join as members';
  end if;

  -- Any other active plain membership the caller does not run blocks it.
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

  -- Whatever remains elsewhere is run by the caller: this is a move.
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
$function$
;

-- previous: discipleship.promote_disciple(p_disciple uuid, p_note text)
CREATE OR REPLACE FUNCTION discipleship.promote_disciple(p_disciple uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'discipleship', 'public'
AS $function$
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

  select discipleship_stage into v_cur from public.members where id = v_member;
  v_next := discipleship.next_db_stage(v_cur);
  if v_next is null then raise exception 'Already at the highest stage'; end if;

  update public.members set discipleship_stage = v_next, updated_at = now()
  where id = v_member;

  -- audit stores DB vocab; views/client map to 'New Believer' at the boundary
  insert into discipleship.stage_transitions (disciple_id, from_stage, to_stage, note, created_by)
  values (p_disciple, v_cur, v_next, p_note, auth.uid());

  perform discipleship.snapshot_checklist(p_disciple, v_next);
end;
$function$
;

-- previous: discipleship.reassign_disciples(p_disciples uuid[], p_to_member uuid)
CREATE OR REPLACE FUNCTION discipleship.reassign_disciples(p_disciples uuid[], p_to_member uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'discipleship', 'public'
AS $function$
declare v_count int;
begin
  if not discipleship.is_agapay_admin() then
    raise exception 'Only an admin can reassign disciples';
  end if;
  update public.members m
    set discipler_id = p_to_member, updated_at = now()
    from discipleship.disciple_profiles dp
    where dp.id = any(p_disciples) and m.id = dp.member_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
;

revoke execute on function
  discipleship.reassign_disciples(uuid[], uuid),
  discipleship.promote_disciple(uuid, text)
from public, anon;
grant execute on function
  discipleship.reassign_disciples(uuid[], uuid),
  discipleship.promote_disciple(uuid, text)
to authenticated, service_role;
