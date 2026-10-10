-- ============================================================================
-- discipleship_init — schema, enums, engagement settings, stage mapping
-- ============================================================================
create schema if not exists discipleship;
grant usage on schema discipleship to anon, authenticated;

-- Agapay app role (distinct from Tierra's user_profiles.role)
do $$ begin create type discipleship.app_role as enum ('admin','discipler');
exception when duplicate_object then null; end $$;

do $$ begin create type discipleship.activity_type as enum
  ('One-on-one','Life Group','Sunday Service','Prayer Meeting','Note');
exception when duplicate_object then null; end $$;

do $$ begin create type discipleship.meeting_mode as enum ('inperson','online');
exception when duplicate_object then null; end $$;

do $$ begin create type discipleship.meeting_status as enum
  ('upcoming','completed','cancelled','noshow');
exception when duplicate_object then null; end $$;

do $$ begin create type discipleship.recurrence as enum ('none','weekly','biweekly');
exception when duplicate_object then null; end $$;

-- ── engagement thresholds — single source of truth (RULES.md #17) ────────────
create table if not exists discipleship.settings (
  id boolean primary key default true check (id),   -- enforces a single row
  amber_after_days int not null default 14,
  red_after_days int not null default 28
);
insert into discipleship.settings (id) values (true) on conflict do nothing;

alter table discipleship.settings enable row level security;
drop policy if exists settings_read on discipleship.settings;
create policy settings_read on discipleship.settings for select using (true);
-- admin-only writes are added in discipleship_profiles (needs is_agapay_admin()).
grant select on discipleship.settings to anon, authenticated;

-- ── stage label mapping (DB 'Newbie' ↔ UI 'New Believer') ────────────────────
create or replace function discipleship.to_ui_stage(p text) returns text
language sql immutable as $$
  select case p when 'Newbie' then 'New Believer' else p end;
$$;

create or replace function discipleship.to_db_stage(p text) returns text
language sql immutable as $$
  select case p when 'New Believer' then 'Newbie' else p end;
$$;

-- next stage in DB terms; null when already Leader
create or replace function discipleship.next_db_stage(p text) returns text
language sql immutable as $$
  select case p when 'Newbie' then 'Growing' when 'Growing' then 'Leader' else null end;
$$;
