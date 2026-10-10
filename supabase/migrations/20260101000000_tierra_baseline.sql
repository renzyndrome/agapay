-- ============================================================================
-- Tierra / Quest Laguna directory baseline (Agapay-relevant subset)
-- ----------------------------------------------------------------------------
-- Reconstructs ONLY the production tables Agapay reads or joins:
--   satellites, members, user_profiles, cell_groups, member_cell_groups,
--   service_types, service_sessions, attendance_records.
--
-- Faithful to the LIVE schema of project ncijotdkovijkcpqnlbv, verified via
-- read-only MCP introspection 2026-07-12:
--   • members.discipleship_stage CHECK ('Newbie','Growing','Leader')
--   • members SELECT policy = members_read_auth (authenticated only, not anon)
--   • user_profiles.role CHECK ('admin','finance','satellite','registration',
--     'discipleship','member')
--   • is_leader_or_admin() / is_any_leader() include 'discipleship'  ← see note
--   • attendance_records has RLS enabled with NO policies (definer-only reads)
--
-- On the shared remote this migration is marked ALREADY APPLIED
-- (`supabase migration repair 20260101000000 --status applied`) so it never
-- executes against production. It exists so local `db reset` has real directory
-- tables to join against, and so RLS tests mirror production's real policies.
--
-- ⚠ SECURITY NOTE (surfaced 2026-07-12): because is_leader_or_admin() includes
-- 'discipleship', any user_profiles row with role='discipleship' can UPDATE
-- public.members directly — bypassing Agapay's promote/reassign audit trail.
-- Agapay therefore does NOT require that role: it identifies a discipler
-- implicitly via members.discipler_id. Give disciplers role='member' to keep
-- the RPC path enforced. See NOTES.md / design/GAPS.md #33.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ── satellites ──────────────────────────────────────────────────────────────
create table if not exists public.satellites (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ── members (the directory; source of truth for identity + stage + discipler) ─
create table if not exists public.members (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text unique,
  phone text,
  city text,
  satellite_id uuid references public.satellites(id) on delete set null,
  discipleship_stage text not null
    check (discipleship_stage in ('Newbie','Growing','Leader')),
  membership_status text not null default 'active'
    check (membership_status in ('visitor','regular','active','inactive')),
  joined_date date,
  photo_url text,
  discipler_id uuid references public.members(id) on delete set null,
  leadership_level text default 'Member'
    check (leadership_level in ('Member','Disciple Maker','Eagle','Pastor','Head Pastor')),
  is_archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_members_discipler on public.members(discipler_id);
create index if not exists idx_members_stage on public.members(discipleship_stage);

-- ── user_profiles (auth ↔ member link + RBAC; Agapay reuses both) ───────────
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  role text not null default 'member'
    check (role in ('admin','finance','satellite','registration','discipleship','member')),
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ── cell_groups (Quest Circles) ─────────────────────────────────────────────
create table if not exists public.cell_groups (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  satellite_id uuid references public.satellites(id) on delete cascade,
  leader_id uuid references public.members(id) on delete set null,
  co_leader_id uuid references public.members(id) on delete set null,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.member_cell_groups (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid references public.members(id) on delete cascade,
  cell_group_id uuid references public.cell_groups(id) on delete cascade,
  role text not null default 'member' check (role in ('leader','co_leader','member')),
  is_active boolean default true,
  unique (member_id, cell_group_id)
);

-- ── service attendance module (QR check-in) — Agapay READS only ─────────────
create table if not exists public.service_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  default_day text,
  sort_order int,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.service_sessions (
  id uuid primary key default gen_random_uuid(),
  service_type_id uuid not null references public.service_types(id) on delete cascade,
  session_date date not null,
  satellite_id uuid references public.satellites(id) on delete set null,
  title text,
  qr_token text not null,
  is_open boolean not null default true,
  opened_at timestamptz default now(),
  closed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
create index if not exists idx_service_sessions_date on public.service_sessions(session_date);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.service_sessions(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  raw_name text,
  raw_phone text,
  checkin_method text not null default 'manual'
    check (checkin_method in ('qr_self','qr_guest','manual')),
  match_status text not null default 'pending'
    check (match_status in ('auto_matched','pending','confirmed','new_member','ignored')),
  matched_by uuid,
  note text,
  checked_in_at timestamptz default now(),
  created_at timestamptz default now(),
  invited_by text
);
create index if not exists idx_attendance_member on public.attendance_records(member_id);
create index if not exists idx_attendance_session on public.attendance_records(session_id);

-- ── RBAC helper functions (bodies copied from production) ───────────────────
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = pg_catalog, public as $$
  select exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin');
$$;

-- NOTE: includes 'discipleship' — this is production's definition verbatim.
create or replace function public.is_leader_or_admin() returns boolean
language sql security definer stable set search_path = pg_catalog, public as $$
  select exists (select 1 from public.user_profiles
                 where id = auth.uid() and role in ('admin','satellite','discipleship'));
$$;

create or replace function public.is_any_leader() returns boolean
language sql security definer stable set search_path = pg_catalog, public as $$
  select exists (select 1 from public.user_profiles
                 where id = auth.uid() and role in ('admin','satellite','discipleship'));
$$;

create or replace function public.get_user_member_id() returns uuid
language sql security definer stable set search_path = pg_catalog, public as $$
  select member_id from public.user_profiles where id = auth.uid();
$$;

-- ── RLS (mirrors production policy names + predicates) ──────────────────────
alter table public.satellites enable row level security;
alter table public.members enable row level security;
alter table public.user_profiles enable row level security;
alter table public.cell_groups enable row level security;
alter table public.member_cell_groups enable row level security;
alter table public.service_types enable row level security;
alter table public.service_sessions enable row level security;
alter table public.attendance_records enable row level security;

drop policy if exists satellites_read on public.satellites;
create policy satellites_read on public.satellites for select using (true);

-- Directory readable by AUTHENTICATED users only (prod: members_read_auth).
drop policy if exists members_read_auth on public.members;
create policy members_read_auth on public.members
  for select using (auth.role() = 'authenticated' and not is_archived);

drop policy if exists members_insert_admin on public.members;
create policy members_insert_admin on public.members
  for insert with check (public.is_leader_or_admin());
drop policy if exists members_update_self on public.members;
create policy members_update_self on public.members
  for update using (id = public.get_user_member_id() or public.is_leader_or_admin());
drop policy if exists members_delete_admin on public.members;
create policy members_delete_admin on public.members
  for delete using (public.is_admin());

drop policy if exists user_profiles_select_own on public.user_profiles;
create policy user_profiles_select_own on public.user_profiles
  for select using (auth.uid() = id);
drop policy if exists user_profiles_update_admin on public.user_profiles;
create policy user_profiles_update_admin on public.user_profiles
  for update using (public.is_admin());

drop policy if exists cell_groups_read on public.cell_groups;
create policy cell_groups_read on public.cell_groups
  for select using (auth.role() = 'authenticated');
drop policy if exists mcg_read on public.member_cell_groups;
create policy mcg_read on public.member_cell_groups
  for select using (auth.role() = 'authenticated');
drop policy if exists service_types_read on public.service_types;
create policy service_types_read on public.service_types
  for select using (auth.role() = 'authenticated');
drop policy if exists service_sessions_read on public.service_sessions;
create policy service_sessions_read on public.service_sessions
  for select using (auth.role() = 'authenticated');
-- attendance_records: RLS enabled with NO policies (prod parity) — readable
-- only through security-definer functions such as discipleship.sunday_attendance().

grant usage on schema public to anon, authenticated;
grant select on public.satellites, public.cell_groups, public.member_cell_groups,
  public.service_types, public.service_sessions to authenticated;
grant select, insert, update, delete on public.members to authenticated;
-- anon keeps the SELECT grant (prod parity, verified live 2026-07-12): the
-- members_read_auth policy filters every row for anon, so a signed-out caller
-- gets an empty set rather than a permission error. Same security outcome,
-- faithful behaviour.
grant select on public.members to anon;
grant select on public.user_profiles to authenticated;
