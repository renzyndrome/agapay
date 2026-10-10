-- ============================================================================
-- Rollback for supabase/migrations/20261009052205_audit_low_views_and_grants.sql
--
-- Restores the previous views, stage_trend, add_disciple and table-wide
-- UPDATE grants. The previous definitions are also in the live backup:
-- tierra/data/backups/2026-10-09_pre-audit-fixes/schema-definitions.sql
-- The helper functions manila_today() and discipler_last_log() are left in
-- place (unused after this rollback). The added columns stay.
-- ============================================================================

create or replace view discipleship.disciple_engagement
with (security_invoker = true) as
select
  dp.id as disciple_id, dp.member_id, m.name,
  discipleship.to_ui_stage(m.discipleship_stage) as stage,
  m.discipler_id, dp.cohort, la.last_activity_on, la.last_activity_type,
  case when la.last_activity_on is null then null::integer
       else current_date - la.last_activity_on end as days_since,
  case when la.last_activity_on is null then 'red'::text
       when current_date - la.last_activity_on > s.red_after_days then 'red'::text
       when current_date - la.last_activity_on > s.amber_after_days then 'amber'::text
       else 'green'::text end as engagement,
  cg.life_group_id, cg.life_group_name,
  coalesce(ck.done_count, 0::bigint) as checklist_done,
  coalesce(ck.total_count, 0::bigint) as checklist_total,
  coalesce(st.in_stage_since, dp.enrolled_at) as in_stage_since
from discipleship.disciple_profiles dp
join public.members m on m.id = dp.member_id
cross join lateral (select settings.amber_after_days, settings.red_after_days
                    from discipleship.settings limit 1) s
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
  order by x.d desc limit 1
) la on true
left join lateral (
  select count(*) filter (where disciple_checklist_items.done) as done_count, count(*) as total_count
  from discipleship.disciple_checklist_items
  where disciple_checklist_items.disciple_id = dp.id
) ck on true
left join lateral (
  select cg2.id as life_group_id, cg2.name as life_group_name
  from public.member_cell_groups mcg
  join public.cell_groups cg2 on cg2.id = mcg.cell_group_id
  where mcg.member_id = dp.member_id and coalesce(mcg.is_active, true) and coalesce(cg2.is_active, true)
  order by cg2.name limit 1
) cg on true
left join lateral (
  select max(stage_transitions.created_at) as in_stage_since
  from discipleship.stage_transitions where stage_transitions.disciple_id = dp.id
) st on true;

create or replace view discipleship.discipler_load
with (security_invoker = true) as
select
  disc.id as discipler_member_id,
  disc.name as discipler_name,
  count(distinct dp.id) as load,
  max(al.occurred_on) as last_log_on,
  case when max(al.occurred_on) is null then null::integer
       else current_date - max(al.occurred_on) end as days_since_log,
  (max(al.occurred_on) is null
   or (current_date - max(al.occurred_on)) > (select amber_after_days from discipleship.settings limit 1))
    as inactive
from public.members disc
join public.members mem on mem.discipler_id = disc.id
join discipleship.disciple_profiles dp on dp.member_id = mem.id
left join discipleship.activity_logs al on al.disciple_id = dp.id
group by disc.id, disc.name;

create or replace function discipleship.stage_trend(p_months integer default 6)
returns table(month_start date, stage text, disciples integer)
language sql stable set search_path = discipleship, public as $$
  with months as (
    select (date_trunc('month', timezone('Asia/Manila', now()))
            - (g.i || ' months')::interval)::date as m
    from generate_series(greatest(p_months, 1) - 1, 0, -1) as g(i)
  ),
  snapshots as (
    select m.m as month_start,
      (select tr.to_stage from discipleship.stage_transitions tr
        where tr.disciple_id = dp.id and tr.created_at < (m.m + interval '1 month')
        order by tr.created_at desc limit 1) as db_stage
    from months m cross join discipleship.disciple_profiles dp
  )
  select s.month_start, discipleship.to_ui_stage(s.db_stage) as stage, count(*)::int as disciples
  from snapshots s where s.db_stage is not null
  group by s.month_start, s.db_stage
  order by s.month_start, s.db_stage;
$$;

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

grant update on discipleship.meetings to authenticated;
grant update on discipleship.disciple_checklist_items to authenticated;
grant update on discipleship.milestones to authenticated;
