-- ============================================================================
-- discipleship_service_role — server-side access for admin tooling
-- ----------------------------------------------------------------------------
-- Supabase grants service_role broad access to `public` automatically, but NOT
-- to schemas we create. Without this the import script (and any future
-- server-side job) fails with "permission denied for schema discipleship".
--
-- service_role already bypasses RLS, so these are table/function GRANTs only —
-- no policy is relaxed for browser clients. The key stays server-side (see
-- .env.example); it is never a VITE_* variable.
-- ============================================================================

grant usage on schema discipleship to service_role;

grant select, insert, update, delete
  on all tables in schema discipleship to service_role;

grant execute on all functions in schema discipleship to service_role;

grant usage, select on all sequences in schema discipleship to service_role;

-- future objects in this schema inherit the same access
alter default privileges in schema discipleship
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema discipleship
  grant execute on functions to service_role;
