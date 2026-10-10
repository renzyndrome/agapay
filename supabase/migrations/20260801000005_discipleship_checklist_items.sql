-- ============================================================================
-- discipleship_checklist_items — per-disciple instance snapshot of the master
-- ----------------------------------------------------------------------------
-- Instances snapshot the master at stage entry; later master edits must NOT
-- mutate in-progress instances (RULES.md #20). Re-snapshot only on promotion.
-- ============================================================================
create table if not exists discipleship.disciple_checklist_items (
  id uuid primary key default gen_random_uuid(),
  disciple_id uuid not null references discipleship.disciple_profiles(id) on delete cascade,
  position int not null,
  text text not null,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_checklist_items_disciple
  on discipleship.disciple_checklist_items(disciple_id);

-- snapshot the master list for a stage onto a disciple (security definer:
-- called by promote/add RPCs and by the import; bypasses RLS intentionally).
-- p_stage_db is DB vocabulary ('Newbie'/'Growing'/'Leader').
create or replace function discipleship.snapshot_checklist(p_disciple uuid, p_stage_db text)
returns void
language plpgsql security definer set search_path = discipleship, public as $$
begin
  delete from discipleship.disciple_checklist_items where disciple_id = p_disciple;
  insert into discipleship.disciple_checklist_items (disciple_id, position, text, done)
  select p_disciple, position, text, false
  from discipleship.master_checklist_items
  where stage = p_stage_db
  order by position;
end;
$$;

alter table discipleship.disciple_checklist_items enable row level security;
drop policy if exists checklist_items_scoped on discipleship.disciple_checklist_items;
create policy checklist_items_scoped on discipleship.disciple_checklist_items
  for select using (discipleship.can_access_disciple(disciple_id));
-- toggling done is the only client mutation
drop policy if exists checklist_items_update on discipleship.disciple_checklist_items;
create policy checklist_items_update on discipleship.disciple_checklist_items
  for update using (discipleship.can_access_disciple(disciple_id))
  with check (discipleship.can_access_disciple(disciple_id));

grant select, update on discipleship.disciple_checklist_items to authenticated;
