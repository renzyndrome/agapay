-- ============================================================================
-- discipleship_meetings — scheduled meetings + completion trigger
-- ----------------------------------------------------------------------------
-- Completing a meeting stamps completed_at; the engagement view reads that as a
-- "last activity", which resets the disciple's engagement clock (key behavior 1).
-- ============================================================================
create table if not exists discipleship.meetings (
  id uuid primary key default gen_random_uuid(),
  disciple_id uuid not null references discipleship.disciple_profiles(id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_min int not null default 60,
  mode discipleship.meeting_mode not null default 'inperson',
  place text,
  recurrence discipleship.recurrence not null default 'none',
  status discipleship.meeting_status not null default 'upcoming',
  note text,
  completed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_meetings_disciple
  on discipleship.meetings(disciple_id, scheduled_at desc);

-- stamp completed_at on the transition into 'completed'
create or replace function discipleship.stamp_meeting_completion()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    new.completed_at := now();
  end if;
  return new;
end;
$$;

-- fire on INSERT too: a meeting logged directly as 'completed' still stamps.
drop trigger if exists trg_meeting_completion on discipleship.meetings;
create trigger trg_meeting_completion
  before insert or update on discipleship.meetings
  for each row execute function discipleship.stamp_meeting_completion();

alter table discipleship.meetings enable row level security;
drop policy if exists meetings_read_scoped on discipleship.meetings;
create policy meetings_read_scoped on discipleship.meetings
  for select using (discipleship.can_access_disciple(disciple_id));
drop policy if exists meetings_insert_scoped on discipleship.meetings;
create policy meetings_insert_scoped on discipleship.meetings
  for insert with check (
    discipleship.can_access_disciple(disciple_id) and created_by = auth.uid()
  );
drop policy if exists meetings_update_scoped on discipleship.meetings;
create policy meetings_update_scoped on discipleship.meetings
  for update using (discipleship.can_access_disciple(disciple_id))
  with check (discipleship.can_access_disciple(disciple_id));

grant select, insert, update on discipleship.meetings to authenticated;
