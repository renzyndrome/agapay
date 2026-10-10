-- ============================================================================
-- Rollback for supabase/migrations/20261009080639_circle_teams.sql
--
-- Restores reassign_disciples, place_in_circle and link_disciple from
-- 20261009070525_audit_medium_integrity.sql and disciple_engagement from
-- 20261009052205_audit_low_views_and_grants.sql (team-unaware versions).
-- The cell_groups.is_team column and its values are kept (data); after this
-- rollback nothing reads it.
-- ============================================================================

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

create or replace view discipleship.disciple_engagement
with (security_invoker = true) as
select
  dp.id as disciple_id,
  dp.member_id,
  m.name,
  discipleship.to_ui_stage(m.discipleship_stage) as stage,
  m.discipler_id,
  dp.cohort,
  la.last_activity_on,
  la.last_activity_type,
  case
    when la.last_activity_on is null then null::integer
    else discipleship.manila_today() - la.last_activity_on
  end as days_since,
  case
    when la.last_activity_on is null then 'red'::text
    when discipleship.manila_today() - la.last_activity_on > s.red_after_days then 'red'::text
    when discipleship.manila_today() - la.last_activity_on > s.amber_after_days then 'amber'::text
    else 'green'::text
  end as engagement,
  cg.life_group_id,
  cg.life_group_name,
  coalesce(ck.done_count, 0::bigint) as checklist_done,
  coalesce(ck.total_count, 0::bigint) as checklist_total,
  coalesce(st.in_stage_since, dp.enrolled_at) as in_stage_since
from discipleship.disciple_profiles dp
join public.members m on m.id = dp.member_id
cross join lateral (
  select settings.amber_after_days, settings.red_after_days
  from discipleship.settings limit 1
) s
left join lateral (
  select x.d as last_activity_on, x.label as last_activity_type
  from (
    select activity_logs.occurred_on as d, activity_logs.type::text as label
    from discipleship.activity_logs
    where activity_logs.disciple_id = dp.id
      and activity_logs.type <> 'Sunday Service'::discipleship.activity_type
    union all
    select (meetings.completed_at at time zone 'Asia/Manila')::date, 'Meeting'::text
    from discipleship.meetings
    where meetings.disciple_id = dp.id
      and meetings.status = 'completed'::discipleship.meeting_status
      and meetings.completed_at is not null
  ) x
  order by x.d desc
  limit 1
) la on true
left join lateral (
  select count(*) filter (where disciple_checklist_items.done) as done_count,
         count(*) as total_count
  from discipleship.disciple_checklist_items
  where disciple_checklist_items.disciple_id = dp.id
) ck on true
left join lateral (
  select cg2.id as life_group_id, cg2.name as life_group_name
  from public.member_cell_groups mcg
  join public.cell_groups cg2 on cg2.id = mcg.cell_group_id
  where mcg.member_id = dp.member_id
    and coalesce(mcg.is_active, true)
    and coalesce(cg2.is_active, true)
  order by (mcg.role = 'member') desc, cg2.name
  limit 1
) cg on true
left join lateral (
  select max(stage_transitions.created_at) as in_stage_since
  from discipleship.stage_transitions
  where stage_transitions.disciple_id = dp.id
) st on true;
