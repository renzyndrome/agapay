-- ============================================================================
-- Rollback for supabase/migrations/20260927064701_discipleship_link_disciple.sql
--
-- Drops link_disciple and is_discipler, restores the previous add_disciple and
-- the previous grants. WARNING: the previous add_disciple guard is NULL-unsafe
-- and anon held EXECUTE, which lets the public anon key insert directory
-- members. Roll back only with a replacement fix ready.
--
-- Disciples linked through link_disciple stay linked (members.discipler_id and
-- their enrollment rows are data, not schema). Unlink them in the directory
-- app or with reassign_disciples if needed.
-- ============================================================================

drop function if exists discipleship.link_disciple(uuid);

create or replace function discipleship.add_disciple(
  p_name text, p_city text, p_stage_db text, p_discipler_member uuid, p_cohort text
) returns uuid
language plpgsql security definer set search_path = discipleship, public as $$
declare
  v_member uuid;
  v_disciple uuid;
begin
  if not (discipleship.is_agapay_admin()
          or p_discipler_member = discipleship.current_member_id()) then
    raise exception 'Not authorized to add a disciple for this discipler';
  end if;

  insert into public.members (name, city, discipleship_stage, discipler_id, membership_status, joined_date)
  values (p_name, p_city, p_stage_db, p_discipler_member, 'active', current_date)
  returning id into v_member;

  insert into discipleship.disciple_profiles (member_id, cohort)
  values (v_member, p_cohort) returning id into v_disciple;

  perform discipleship.snapshot_checklist(v_disciple, p_stage_db);

  insert into discipleship.stage_transitions (disciple_id, from_stage, to_stage, note, created_by)
  values (v_disciple, null, p_stage_db, 'Joined Agapay', auth.uid());

  return v_disciple;
end;
$$;

drop function if exists discipleship.is_discipler(uuid);

grant execute on function
  discipleship.add_disciple(text, text, text, uuid, text),
  discipleship.promote_disciple(uuid, text),
  discipleship.reassign_disciples(uuid[], uuid)
to public, anon, authenticated;
