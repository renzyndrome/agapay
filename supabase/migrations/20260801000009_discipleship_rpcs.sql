-- ============================================================================
-- discipleship_rpcs — the ONLY sanctioned writes to public.members
-- ----------------------------------------------------------------------------
-- Model 1: Agapay changes members.discipleship_stage / discipler_id and inserts
-- minimal member rows ONLY through these security-definer RPCs. Each re-checks
-- authorization manually (definer bypasses RLS) and touches nothing else in
-- Tierra. Prime directive: no other Tierra column or table is ever written.
-- ============================================================================

-- ── promote_disciple: requires a note; advances the directory stage ──────────
create or replace function discipleship.promote_disciple(p_disciple uuid, p_note text)
returns void
language plpgsql security definer set search_path = discipleship, public as $$
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
$$;

-- ── reassign_disciples: admin-only bulk move between disciplers ──────────────
create or replace function discipleship.reassign_disciples(p_disciples uuid[], p_to_member uuid)
returns int
language plpgsql security definer set search_path = discipleship, public as $$
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
$$;

-- ── add_disciple: minimal directory insert so new believers appear at once ───
-- p_stage_db is DB vocabulary ('Newbie'/'Growing'/'Leader'); the client maps
-- the UI label before calling.
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

grant execute on function
  discipleship.promote_disciple(uuid, text),
  discipleship.reassign_disciples(uuid[], uuid),
  discipleship.add_disciple(text, text, text, uuid, text)
to authenticated;
