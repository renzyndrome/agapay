-- ============================================================================
-- discipleship_stage_trend — the growth chart, replayed from real history
-- ----------------------------------------------------------------------------
-- Replaces the prototype's hard-coded STAGE_TREND_HISTORY. A disciple's stage
-- at month M is the to_stage of their latest transition on or before the end of
-- M; disciples who had not joined yet simply do not count that month.
--
-- SECURITY INVOKER (the default) on purpose: disciple_profiles RLS then applies,
-- so a discipler sees only their own people's trend and an admin sees all. This
-- keeps the same access model as the other read views — no revoke, no
-- definer-only RPC (docs/phases/README.md consistency finding C8).
-- ============================================================================

create or replace function discipleship.stage_trend(p_months int default 6)
returns table (month_start date, stage text, disciples int)
language sql stable
set search_path = discipleship, public as $$
  with months as (
    select (date_trunc('month', timezone('Asia/Manila', now()))
            - (g.i || ' months')::interval)::date as m
    from generate_series(greatest(p_months, 1) - 1, 0, -1) as g(i)
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

grant execute on function discipleship.stage_trend(int) to authenticated;
