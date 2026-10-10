-- ============================================================================
-- discipleship_milestones — per-disciple milestone list (baptism, first serve…)
-- ============================================================================
create table if not exists discipleship.milestones (
  id uuid primary key default gen_random_uuid(),
  disciple_id uuid not null references discipleship.disciple_profiles(id) on delete cascade,
  title text not null,
  position int not null default 0,
  achieved_on date,
  created_at timestamptz not null default now()
);
create index if not exists idx_milestones_disciple
  on discipleship.milestones(disciple_id, position);

alter table discipleship.milestones enable row level security;
drop policy if exists milestones_read_scoped on discipleship.milestones;
create policy milestones_read_scoped on discipleship.milestones
  for select using (discipleship.can_access_disciple(disciple_id));
drop policy if exists milestones_update_scoped on discipleship.milestones;
create policy milestones_update_scoped on discipleship.milestones
  for update using (discipleship.can_access_disciple(disciple_id))
  with check (discipleship.can_access_disciple(disciple_id));

grant select, update on discipleship.milestones to authenticated;
