-- ============================================================================
-- TEST-ONLY Supabase auth shim  (NOT a migration — never ships to Supabase)
-- ----------------------------------------------------------------------------
-- Real Supabase already provides the auth schema, the anon/authenticated/
-- service_role roles, and auth.uid()/auth.role(). This file recreates the
-- minimum of that contract in a plain Postgres container so RLS policies can be
-- exercised exactly as they will run in production.
--
-- To act as a user in a test:
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
-- ============================================================================

do $$ begin create role anon nologin noinherit;
exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin noinherit;
exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin noinherit bypassrls;
exception when duplicate_object then null; end $$;

-- the loading superuser must be able to SET ROLE into these
grant anon, authenticated, service_role to current_user;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

-- auth.uid(): read the JWT 'sub' claim (matches Supabase's implementation)
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif((nullif(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'sub', '')
  )::uuid
$$;

-- auth.role(): read the JWT 'role' claim
create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif((nullif(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'role', '')
  )
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
