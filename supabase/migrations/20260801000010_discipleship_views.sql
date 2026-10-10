-- ============================================================================
-- discipleship_views — derived read models (never stored; RULES.md #18)
-- ----------------------------------------------------------------------------
-- security_invoker = true so each view respects the querying user's RLS: a
-- discipler sees only their disciples through disciple_engagement.
-- ============================================================================

-- ── per-disciple engagement, derived from activities + completed meetings ────
create or replace view discipleship.disciple_engagement
with (security_invoker = true) as
select
  dp.id                                   as disciple_id,
  dp.member_id,
  m.name,
  discipleship.to_ui_stage(m.discipleship_stage) as stage,
  m.discipler_id,
  dp.cohort,
  la.last_activity_on,
  case when la.last_activity_on is null then null
       else (current_date - la.last_activity_on) end as days_since,
  case
    when la.last_activity_on is null then 'red'
    when (current_date - la.last_activity_on) > s.red_after_days then 'red'
    when (current_date - la.last_activity_on) > s.amber_after_days then 'amber'
    else 'green'
  end as engagement
from discipleship.disciple_profiles dp
join public.members m on m.id = dp.member_id
cross join lateral (select amber_after_days, red_after_days from discipleship.settings limit 1) s
left join lateral (
  select max(d) as last_activity_on
  from (
    -- PERSONAL TOUCHES ONLY (decision 2026-07-12). Sunday Service is a passive
    -- group touchpoint — it feeds the attendance sparkline
    -- (discipleship.sunday_attendance) but must never silence the follow-up
    -- queue, or a disciple who only warms a pew would look "healthy" while
    -- nobody actually walks with them.
    select occurred_on as d
      from discipleship.activity_logs
      where disciple_id = dp.id
        and type <> 'Sunday Service'
    union all
    select (completed_at at time zone 'Asia/Manila')::date
      from discipleship.meetings
      where disciple_id = dp.id and status = 'completed' and completed_at is not null
  ) x
) la on true;

-- ── discipler load + own-activity recency (Inactive flag source) ─────────────
-- NB: this one counts ALL log types (including Sunday Service) on purpose — it
-- measures whether the discipler is still using the app at all, not whether a
-- particular disciple got a personal touch. Being generous here avoids
-- flagging a faithful discipler as "Inactive" (RULES #12, no-guilt copy).
create or replace view discipleship.discipler_load
with (security_invoker = true) as
select
  disc.id                                as discipler_member_id,
  disc.name                              as discipler_name,
  count(distinct dp.id)                  as load,
  max(al.occurred_on)                    as last_log_on,
  case when max(al.occurred_on) is null then null
       else (current_date - max(al.occurred_on)) end as days_since_log,
  (max(al.occurred_on) is null
   or (current_date - max(al.occurred_on)) > (select amber_after_days from discipleship.settings limit 1))
                                         as inactive
from public.members disc
join public.members mem on mem.discipler_id = disc.id
join discipleship.disciple_profiles dp on dp.member_id = mem.id
left join discipleship.activity_logs al on al.disciple_id = dp.id
group by disc.id, disc.name;

-- ── current stage distribution (true monthly trend = Phase 5, needs replay) ──
create or replace view discipleship.stage_distribution
with (security_invoker = true) as
select
  discipleship.to_ui_stage(m.discipleship_stage) as stage,
  count(*) as disciples
from discipleship.disciple_profiles dp
join public.members m on m.id = dp.member_id
group by discipleship.to_ui_stage(m.discipleship_stage);

grant select on
  discipleship.disciple_engagement,
  discipleship.discipler_load,
  discipleship.stage_distribution
to authenticated;

-- ensure policy/helper functions are executable by app roles
grant execute on all functions in schema discipleship to anon, authenticated;
