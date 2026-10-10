-- ============================================================================
-- discipleship_attendance — 12-week Sunday sparkline from the QR check-in module
-- ----------------------------------------------------------------------------
-- The directory's service-attendance module (service_types → service_sessions →
-- attendance_records) is the real source of Sunday attendance. Agapay READS it;
-- it never writes there.
--
-- Why a SECURITY DEFINER function rather than a view: production has RLS enabled
-- on attendance_records with NO policies at all, so no client role can select
-- from it directly. This function is the sanctioned read path, and it re-checks
-- authorization itself via can_access_disciple() (definer bypasses RLS).
--
-- Bucketing: the last 12 Sundays in Asia/Manila (RULES #22). A week counts as
-- attended when the member has a non-'ignored' attendance record on a session
-- dated that Sunday — any service held that day (Family Sunday, Youth, Young
-- Pro) counts, because pastorally the question is "were they with us".
-- ============================================================================

create or replace function discipleship.sunday_attendance(p_disciple uuid)
returns table (week_start date, attended boolean)
language plpgsql stable security definer
set search_path = discipleship, public as $$
declare
  v_member uuid;
  v_last_sunday date;
begin
  if not discipleship.can_access_disciple(p_disciple) then
    raise exception 'Not authorized to view this disciple''s attendance';
  end if;

  select dp.member_id into v_member
  from discipleship.disciple_profiles dp
  where dp.id = p_disciple;

  if v_member is null then
    return;
  end if;

  -- most recent Sunday, Asia/Manila (extract(dow) = 0 on Sundays)
  v_last_sunday := (timezone('Asia/Manila', now())::date)
                   - extract(dow from timezone('Asia/Manila', now())::date)::int;

  return query
  with weeks as (
    select (v_last_sunday - (g.i * 7))::date as wk
    from generate_series(11, 0, -1) as g(i)
  )
  select w.wk,
         exists (
           select 1
           from public.attendance_records ar
           join public.service_sessions ss on ss.id = ar.session_id
           where ar.member_id = v_member
             and ar.match_status <> 'ignored'
             and ss.session_date = w.wk
         )
  from weeks w
  order by w.wk;
end;
$$;

grant execute on function discipleship.sunday_attendance(uuid) to authenticated;
