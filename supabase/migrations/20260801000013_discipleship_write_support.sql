-- ============================================================================
-- discipleship_write_support — safe writes for the app's mutations
-- ----------------------------------------------------------------------------
-- 1. set_master_checklist(): admin edits (add / remove / reorder) replace a
--    stage's list in ONE transaction. Doing it as client-side
--    delete-then-insert risks wiping a stage if the second call fails, and
--    naive position swaps collide with the (stage, position) unique index.
--    Master edits still never touch instances already in progress (RULES #20).
-- 2. stamp_checklist_completion(): records WHEN an item was ticked so the
--    profile timeline can show it, and clears it on un-tick.
-- ============================================================================

create or replace function discipleship.set_master_checklist(
  p_stage_db text, p_texts text[]
) returns int
language plpgsql security definer set search_path = discipleship, public as $$
declare v_i int;
begin
  if not discipleship.is_agapay_admin() then
    raise exception 'Only an admin can edit the master checklist';
  end if;
  if p_stage_db not in ('Newbie','Growing','Leader') then
    raise exception 'Unknown stage %', p_stage_db;
  end if;

  delete from discipleship.master_checklist_items where stage = p_stage_db;

  for v_i in 1 .. coalesce(array_length(p_texts, 1), 0) loop
    insert into discipleship.master_checklist_items (stage, position, text)
    values (p_stage_db, v_i, p_texts[v_i]);
  end loop;

  return coalesce(array_length(p_texts, 1), 0);
end;
$$;

grant execute on function discipleship.set_master_checklist(text, text[]) to authenticated;

-- ── stamp when a checklist item is completed (feeds disciple_timeline) ───────
create or replace function discipleship.stamp_checklist_completion()
returns trigger language plpgsql as $$
begin
  if new.done and not coalesce(old.done, false) then
    new.done_at := now();
  elsif not new.done then
    new.done_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_checklist_completion on discipleship.disciple_checklist_items;
create trigger trg_checklist_completion
  before update on discipleship.disciple_checklist_items
  for each row execute function discipleship.stamp_checklist_completion();
