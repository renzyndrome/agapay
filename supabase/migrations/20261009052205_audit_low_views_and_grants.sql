-- ============================================================================
-- Audit fixes, Low (2026-10-09).
--
-- 1. Manila dates. Views compared CURRENT_DATE (the database runs in UTC) with
--    Manila dates, so "days since" read -1 and thresholds were off by a day for
--    8 hours every night. New helper discipleship.manila_today().
-- 2. disciple_engagement: the shown Quest Circle prefers the disciple's plain
--    membership over a circle they lead (was: first by name, any role).
-- 3. discipler_load: "Inactive discipler" now uses the discipler's OWN last
--    logged activity (CLAUDE.md behavior #5), not the latest log about their
--    current disciples by anyone. user_profiles is readable only for one's own
--    row, so the lookup is a small SECURITY DEFINER helper returning a date.
-- 4. stage_trend: months clamped to 1..36 (any signed-in user could ask for
--    20000 months and run a very slow query).
-- 5. add_disciple: a new believer gets the discipler's satellite.
-- 6. Column-level UPDATE: the app updates only meetings.status/note and
--    disciple_checklist_items.done. Table-wide UPDATE let a discipler rewrite
--    checklist text or meeting completion times on their own disciples.
--    Milestones are never updated by the app.
-- 7. member_cell_groups.joined_at / left_at: add if missing. Production has
--    them; local resets from these migrations did not.
--
-- Rollback: supabase/rollbacks/20261009052205_audit_low_views_and_grants_down.sql
-- ============================================================================

-- ── 7. columns both apps write (no-op in production) ───────────────────────
alter table public.member_cell_groups add column if not exists joined_at timestamptz default now();
alter table public.member_cell_groups add column if not exists left_at timestamptz;

-- ── 1. today in Manila ──────────────────────────────────────────────────────
create or replace function discipleship.manila_today() returns date
language sql stable set search_path = discipleship, public as $$
  select (now() at time zone 'Asia/Manila')::date;
$$;

-- ── 1 + 2. disciple_engagement ──────────────────────────────────────────────
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

-- ── 3. discipler_load: the discipler's own last log ─────────────────────────
-- Date only. Reads the discipler's accounts (user_profiles.member_id) and the
-- activity they logged; SECURITY DEFINER because user_profiles is own-row only.
create or replace function discipleship.discipler_last_log(p_member uuid) returns date
language sql stable security definer set search_path = discipleship, public as $$
  select max(al.occurred_on)
  from discipleship.activity_logs al
  join public.user_profiles up on up.id = al.created_by
  where up.member_id = p_member;
$$;
revoke execute on function discipleship.discipler_last_log(uuid) from public, anon;
grant execute on function discipleship.discipler_last_log(uuid) to authenticated, service_role;

create or replace view discipleship.discipler_load
with (security_invoker = true) as
select
  d.discipler_member_id,
  d.discipler_name,
  d.load,
  d.last_log_on,
  case
    when d.last_log_on is null then null::integer
    else discipleship.manila_today() - d.last_log_on
  end as days_since_log,
  (d.last_log_on is null
   or discipleship.manila_today() - d.last_log_on
      > (select settings.amber_after_days from discipleship.settings limit 1)) as inactive
from (
  select
    disc.id as discipler_member_id,
    disc.name as discipler_name,
    count(distinct dp.id) as load,
    discipleship.discipler_last_log(disc.id) as last_log_on
  from public.members disc
  join public.members mem on mem.discipler_id = disc.id
  join discipleship.disciple_profiles dp on dp.member_id = mem.id
  group by disc.id, disc.name
) d;

-- ── 4. stage_trend: 1..36 months ────────────────────────────────────────────
create or replace function discipleship.stage_trend(p_months integer default 6)
returns table(month_start date, stage text, disciples integer)
language sql stable set search_path = discipleship, public as $$
  with months as (
    select (date_trunc('month', timezone('Asia/Manila', now()))
            - (g.i || ' months')::interval)::date as m
    from generate_series(least(greatest(coalesce(p_months, 6), 1), 36) - 1, 0, -1) as g(i)
  ),
  snapshots as (
    select
      m.m as month_start,
      (
        select tr.to_stage
        from discipleship.stage_transitions tr
        where tr.disciple_id = dp.id
          and tr.created_at < (m.m + interval '1 month')
        order by tr.created_at desc
        limit 1
      ) as db_stage
    from months m
    cross join discipleship.disciple_profiles dp
  )
  select
    s.month_start,
    discipleship.to_ui_stage(s.db_stage) as stage,
    count(*)::int as disciples
  from snapshots s
  where s.db_stage is not null
  group by s.month_start, s.db_stage
  order by s.month_start, s.db_stage;
$$;

-- ── 5. add_disciple: discipler's satellite ──────────────────────────────────
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

  insert into public.members (name, city, discipleship_stage, discipler_id, membership_status, joined_date, satellite_id)
  values (btrim(p_name), coalesce(btrim(p_city), ''), p_stage_db, p_discipler_member, 'active', current_date,
          (select satellite_id from public.members where id = p_discipler_member))
  returning id into v_member;

  insert into discipleship.disciple_profiles (member_id, cohort)
  values (v_member, p_cohort) returning id into v_disciple;

  perform discipleship.snapshot_checklist(v_disciple, p_stage_db);

  insert into discipleship.stage_transitions (disciple_id, from_stage, to_stage, note, created_by)
  values (v_disciple, null, p_stage_db, 'Joined Agapay', auth.uid());

  return v_disciple;
end;
$$;

-- ── 6. column-level UPDATE for the app's own writes ─────────────────────────
revoke update on discipleship.meetings from authenticated;
grant update (status, note) on discipleship.meetings to authenticated;

revoke update on discipleship.disciple_checklist_items from authenticated;
grant update (done) on discipleship.disciple_checklist_items to authenticated;

revoke update on discipleship.milestones from authenticated;
