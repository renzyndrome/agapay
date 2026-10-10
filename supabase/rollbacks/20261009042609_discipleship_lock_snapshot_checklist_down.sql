-- ============================================================================
-- Rollback for supabase/migrations/20261009042609_discipleship_lock_snapshot_checklist.sql
--
-- WARNING: restores the hole. With EXECUTE back on anon, the public anon key
-- can reset any disciple's checklist again. Roll back only with a
-- replacement fix ready.
-- ============================================================================

grant execute on function discipleship.snapshot_checklist(uuid, text)
  to anon, authenticated;
grant execute on function discipleship.set_master_checklist(text, text[])
  to anon;
