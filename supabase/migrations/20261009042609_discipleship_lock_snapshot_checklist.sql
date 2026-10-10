-- ============================================================================
-- Discipleship: snapshot_checklist runs on the server only.
--
-- snapshot_checklist(disciple, stage) deletes a disciple's checklist and
-- re-creates it with every item unticked. It has no caller check, and anon and
-- authenticated held EXECUTE, so the public anon key could reset any
-- disciple's checklist progress (found by the security advisor, 2026-10-09).
--
-- Every real caller runs on the server:
--   - add_disciple, link_disciple, promote_disciple (SECURITY DEFINER, so the
--     call runs as the function owner, which keeps EXECUTE);
--   - the directory app's Agapay enrollment (service-role client);
--   - scripts/import-disciples.ts and scripts/resnapshot-checklists.ts
--     (service-role key).
-- The Agapay browser app never calls it.
--
-- Also: set_master_checklist is admin-guarded inside, but anon still held
-- EXECUTE. Signed-in callers keep it (the admin checklist editor uses it).
--
-- Rollback: supabase/rollbacks/20261009042609_discipleship_lock_snapshot_checklist_down.sql
-- ============================================================================

revoke execute on function discipleship.snapshot_checklist(uuid, text)
  from public, anon, authenticated;
grant execute on function discipleship.snapshot_checklist(uuid, text)
  to service_role;

revoke execute on function discipleship.set_master_checklist(text, text[])
  from public, anon;
grant execute on function discipleship.set_master_checklist(text, text[])
  to authenticated, service_role;
