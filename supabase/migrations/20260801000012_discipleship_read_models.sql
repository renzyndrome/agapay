-- ============================================================================
-- discipleship_read_models — the columns the UI actually renders
-- ----------------------------------------------------------------------------
-- Phase 3 ADDS to Phase 1's read models; it never changes the `disciple_id`
-- key or drops the server-derived `engagement` column (docs/phases/README.md
-- reconciliation directive C3).
--
-- Added to disciple_engagement: the Quest Circle the disciple belongs to,
-- checklist progress, the type of the last personal touch (for the queue's
-- "Last seen: …" blurb) and time-in-stage.
-- New: disciple_timeline — the append-only feed the profile screen renders,
-- assembled from activity logs, meetings, checklist completions and stage
-- transitions (RULES.md #21).
-- ============================================================================

drop view if exists discipleship.disciple_engagement;

create view discipleship.disciple_engagement
with (security_invoker = true) as
select
  dp.id                                          as disciple_id,
  dp.member_id,
  m.name,
  discipleship.to_ui_stage(m.discipleship_stage) as stage,
  m.discipler_id,
  dp.cohort,
  la.last_activity_on,
  la.last_activity_type,
  case when la.last_activity_on is null then null
       else (current_date - la.last_activity_on) end as days_since,
  case
    when la.last_activity_on is null then 'red'
    when (current_date - la.last_activity_on) > s.red_after_days then 'red'
    when (current_date - la.last_activity_on) > s.amber_after_days then 'amber'
    else 'green'
  end                                            as engagement,
  cg.life_group_id,
  cg.life_group_name,
  coalesce(ck.done_count, 0)                     as checklist_done,
  coalesce(ck.total_count, 0)                    as checklist_total,
  coalesce(st.in_stage_since, dp.enrolled_at)    as in_stage_since
from discipleship.disciple_profiles dp
join public.members m on m.id = dp.member_id
cross join lateral (
  select amber_after_days, red_after_days from discipleship.settings limit 1
) s
-- most recent PERSONAL touch (Sunday attendance deliberately excluded — see
-- the 2026-07-12 decision in NOTES.md), with its label for the queue blurb
left join lateral (
  select x.d as last_activity_on, x.label as last_activity_type
  from (
    select occurred_on as d, type::text as label
      from discipleship.activity_logs
      where disciple_id = dp.id and type <> 'Sunday Service'
    union all
    select (completed_at at time zone 'Asia/Manila')::date, 'Meeting'
      from discipleship.meetings
      where disciple_id = dp.id and status = 'completed' and completed_at is not null
  ) x
  order by x.d desc
  limit 1
) la on true
left join lateral (
  select count(*) filter (where done) as done_count, count(*) as total_count
  from discipleship.disciple_checklist_items
  where disciple_id = dp.id
) ck on true
-- the disciple's active Quest Circle (cell group), if any
left join lateral (
  select cg2.id as life_group_id, cg2.name as life_group_name
  from public.member_cell_groups mcg
  join public.cell_groups cg2 on cg2.id = mcg.cell_group_id
  where mcg.member_id = dp.member_id
    and coalesce(mcg.is_active, true)
    and coalesce(cg2.is_active, true)
  order by cg2.name
  limit 1
) cg on true
left join lateral (
  select max(created_at) as in_stage_since
  from discipleship.stage_transitions
  where disciple_id = dp.id
) st on true;

-- ── profile timeline: append-only union of everything that happened ─────────
create or replace view discipleship.disciple_timeline
with (security_invoker = true) as
  select
    al.disciple_id,
    case when al.type = 'Note' then 'note' else 'activity' end as kind,
    al.type::text                                              as title,
    al.occurred_on                                             as event_date,
    al.note,
    al.created_at
  from discipleship.activity_logs al
union all
  select
    mt.disciple_id,
    'meeting',
    case mt.status
      when 'completed' then 'Meeting completed'
      when 'cancelled' then 'Meeting cancelled'
      when 'noshow'    then 'Meeting missed'
      else 'Meeting scheduled'
    end,
    (coalesce(mt.completed_at, mt.scheduled_at) at time zone 'Asia/Manila')::date,
    mt.note,
    mt.created_at
  from discipleship.meetings mt
union all
  select
    ci.disciple_id,
    'check',
    'Checklist: ' || ci.text,
    (ci.done_at at time zone 'Asia/Manila')::date,
    null,
    ci.done_at
  from discipleship.disciple_checklist_items ci
  where ci.done and ci.done_at is not null
union all
  select
    tr.disciple_id,
    'stage',
    case when tr.from_stage is null
         then 'Joined Agapay'
         else 'Promoted to ' || discipleship.to_ui_stage(tr.to_stage) end,
    (tr.created_at at time zone 'Asia/Manila')::date,
    tr.note,
    tr.created_at
  from discipleship.stage_transitions tr;

grant select on discipleship.disciple_engagement, discipleship.disciple_timeline
  to authenticated;
