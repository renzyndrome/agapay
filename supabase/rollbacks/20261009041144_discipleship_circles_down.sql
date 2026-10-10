-- ============================================================================
-- Rollback for supabase/migrations/20261009041144_discipleship_circles.sql
--
-- Drops create_circle and place_in_circle. Circles and circle memberships
-- created through them stay (they are data, not schema). Edit or remove them
-- in the directory app if needed.
-- ============================================================================

drop function if exists discipleship.place_in_circle(uuid, uuid);
drop function if exists discipleship.create_circle(text);
