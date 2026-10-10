-- ============================================================================
-- Discipleship: Quest Circles from Agapay.
--
-- 1. create_circle(name): a discipler starts their own Quest Circle. The caller
--    becomes its leader; the circle sits in the caller's satellite. Same row the
--    directory app's createCellGroup writes (it adds no member_cell_groups row
--    for the leader either).
-- 2. place_in_circle(disciple, circle): a discipler puts one of their OWN
--    disciples in a circle they lead or co-lead. An admin may place anyone.
--    A disciple is a plain member of one circle at a time, the same rule as the
--    directory app: an active membership elsewhere blocks the placement, unless
--    the caller also runs that other circle (then it is a move). A previous,
--    inactive membership of the same circle is reactivated, because
--    member_cell_groups is UNIQUE (member_id, cell_group_id).
--
-- Write boundary: Agapay used to write only members.discipler_id and
-- members.discipleship_stage in the directory's tables. These functions add
-- public.cell_groups (insert) and public.member_cell_groups (insert, reactivate,
-- deactivate on a move), the same rows the directory app writes for the same
-- actions. Both are SECURITY DEFINER with their own guards; no table grant or
-- RLS policy changes.
--
-- Rollback: supabase/rollbacks/20261009041144_discipleship_circles_down.sql
-- ============================================================================

-- ── create_circle: a discipler starts a circle they lead ────────────────────
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

-- ── place_in_circle: put a disciple in a circle the caller runs ─────────────
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
$$;

-- ── grants: signed-in callers only ──────────────────────────────────────────
revoke execute on function
  discipleship.create_circle(text),
  discipleship.place_in_circle(uuid, uuid)
from public, anon;

grant execute on function
  discipleship.create_circle(text),
  discipleship.place_in_circle(uuid, uuid)
to authenticated, service_role;
