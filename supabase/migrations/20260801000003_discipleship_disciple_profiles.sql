-- ============================================================================
-- discipleship_disciple_profiles — enrollment + stage-transition audit
-- ----------------------------------------------------------------------------
-- Stage and discipler are NOT stored here (Model 1: they live on public.members).
-- This table holds only what the directory doesn't: enrollment + Agapay cohort.
-- ============================================================================
create table if not exists discipleship.disciple_profiles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.members(id) on delete cascade,
  cohort text,
  enrolled_at timestamptz not null default now()
);

-- append-only stage-transition audit (promotion trail; RULES.md #21)
create table if not exists discipleship.stage_transitions (
  id uuid primary key default gen_random_uuid(),
  disciple_id uuid not null references discipleship.disciple_profiles(id) on delete cascade,
  from_stage text,               -- UI stage label, null on intake
  to_stage text not null,        -- UI stage label
  note text not null,            -- required audit note
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_stage_transitions_disciple
  on discipleship.stage_transitions(disciple_id);

-- central scoping predicate: admin, or the disciple's discipler-of-record.
-- security definer so it can read across tables without re-triggering RLS.
create or replace function discipleship.can_access_disciple(p_disciple uuid)
returns boolean
language sql stable security definer set search_path = discipleship, public as $$
  select discipleship.is_agapay_admin()
      or exists (
        select 1
        from discipleship.disciple_profiles dp
        join public.members m on m.id = dp.member_id
        where dp.id = p_disciple
          and m.discipler_id = discipleship.current_member_id()
      );
$$;

alter table discipleship.disciple_profiles enable row level security;
drop policy if exists disciple_profiles_scoped on discipleship.disciple_profiles;
create policy disciple_profiles_scoped on discipleship.disciple_profiles
  for select using (
    discipleship.is_agapay_admin()
    or exists (
      select 1 from public.members m
      where m.id = disciple_profiles.member_id
        and m.discipler_id = discipleship.current_member_id()
    )
  );

alter table discipleship.stage_transitions enable row level security;
drop policy if exists stage_transitions_scoped on discipleship.stage_transitions;
create policy stage_transitions_scoped on discipleship.stage_transitions
  for select using (discipleship.can_access_disciple(disciple_id));
-- inserts only via the promote/add RPCs (security definer); no client insert policy.

grant select on discipleship.disciple_profiles to authenticated;
grant select on discipleship.stage_transitions to authenticated;
