-- ============================================================================
-- discipleship_activity_logs — append-only activity timeline
-- ----------------------------------------------------------------------------
-- Append-only (RULES.md #21): disciplers may INSERT and SELECT, never UPDATE
-- or DELETE. Enforced twice — by omitting update/delete policies AND by not
-- granting those privileges. Corrections are new 'Note' rows, not edits.
-- ============================================================================
create table if not exists discipleship.activity_logs (
  id uuid primary key default gen_random_uuid(),
  disciple_id uuid not null references discipleship.disciple_profiles(id) on delete cascade,
  type discipleship.activity_type not null,
  occurred_on date not null default current_date,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_activity_logs_disciple
  on discipleship.activity_logs(disciple_id, occurred_on desc);

alter table discipleship.activity_logs enable row level security;

drop policy if exists activity_read_scoped on discipleship.activity_logs;
create policy activity_read_scoped on discipleship.activity_logs
  for select using (discipleship.can_access_disciple(disciple_id));

drop policy if exists activity_insert_scoped on discipleship.activity_logs;
create policy activity_insert_scoped on discipleship.activity_logs
  for insert with check (
    discipleship.can_access_disciple(disciple_id)
    and created_by = auth.uid()
  );

-- NOTE: intentionally no UPDATE or DELETE policy → append-only.
grant select, insert on discipleship.activity_logs to authenticated;
