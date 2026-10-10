-- ============================================================================
-- discipleship_master_checklists — admin-editable per-stage item lists
-- ============================================================================
-- stage stored in DB vocabulary ('Newbie'/'Growing'/'Leader') — the locked rule
-- is that 'New Believer' is never STORED in SQL; it surfaces only in views + client.
create table if not exists discipleship.master_checklist_items (
  id uuid primary key default gen_random_uuid(),
  stage text not null check (stage in ('Newbie','Growing','Leader')),
  position int not null,
  text text not null,
  unique (stage, position)
);

alter table discipleship.master_checklist_items enable row level security;

-- everyone signed in can read the master lists
drop policy if exists master_read on discipleship.master_checklist_items;
create policy master_read on discipleship.master_checklist_items
  for select using (true);

-- only admins add / edit / remove / reorder
drop policy if exists master_write_admin on discipleship.master_checklist_items;
create policy master_write_admin on discipleship.master_checklist_items
  for all using (discipleship.is_agapay_admin())
  with check (discipleship.is_agapay_admin());

grant select on discipleship.master_checklist_items to anon, authenticated;
grant insert, update, delete on discipleship.master_checklist_items to authenticated;
