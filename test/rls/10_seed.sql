-- ============================================================================
-- TEST seed — personas that exercise cross-discipler isolation + the RBAC model
-- ----------------------------------------------------------------------------
-- 6 auth users:
--   Alma, Josie, Rodel    — disciplers, user_profiles.role = 'member'
--                           (RECOMMENDED config: no direct member write)
--   Gina                  — discipler with role = 'discipleship'
--                           (proves scoping works for that role too, and
--                            documents that Tierra grants it member writes)
--   Danilo                — role = 'admin' (Agapay admin)
--   Nobody                — role = 'member', disciples no one → sees nothing
--
-- Being a discipler is IMPLICIT: members.discipler_id points at you.
-- ============================================================================

-- auth users
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001','alma@quest.test'),
  ('a0000000-0000-0000-0000-000000000002','josie@quest.test'),
  ('a0000000-0000-0000-0000-000000000003','gina@quest.test'),
  ('a0000000-0000-0000-0000-000000000004','rodel@quest.test'),
  ('a0000000-0000-0000-0000-000000000005','danilo@quest.test'),
  ('a0000000-0000-0000-0000-000000000006','nobody@quest.test');

-- satellite
insert into public.satellites (id, name) values
  ('50000000-0000-0000-0000-000000000001','Quest Laguna Main');

-- disciplers-as-members
insert into public.members (id, name, city, discipleship_stage, discipler_id, satellite_id) values
  ('b0000000-0000-0000-0000-000000000001','Alma Mallari Estrada','Calamba','Leader',null,'50000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002','Josie Lyn Rivera Baluyot','Calamba','Leader',null,'50000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000003','Gina Dimalanta Valencia','Calamba','Leader',null,'50000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000004','Rodel II Sarmiento Magbanua','Calamba','Leader',null,'50000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000006','Nobody Inparticular','Calamba','Growing',null,'50000000-0000-0000-0000-000000000001');

-- disciples (discipler_id points at the discipler member)
insert into public.members (id, name, city, discipleship_stage, discipler_id, satellite_id) values
  ('c0000000-0000-0000-0000-000000000011','Arnel Salcedo','Calamba','Newbie','b0000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000012','Mila Roque','Calamba','Growing','b0000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000021','Cheska Calderon','Calamba','Growing','b0000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000031','Rizalyn Ylagan','Calamba','Growing','b0000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000041','Anselmo Corpuz','Calamba','Growing','b0000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000001');

-- directory RBAC: disciplers stay 'member' except Gina ('discipleship');
-- Danilo is the admin; Nobody is a plain member who disciples no one.
insert into public.user_profiles (id, member_id, role) values
  ('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','member'),
  ('a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000002','member'),
  ('a0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000003','discipleship'),
  ('a0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000004','member'),
  ('a0000000-0000-0000-0000-000000000005',null,'admin'),
  ('a0000000-0000-0000-0000-000000000006','b0000000-0000-0000-0000-000000000006','member');

-- enrollments
insert into discipleship.disciple_profiles (id, member_id, cohort) values
  ('d0000000-0000-0000-0000-000000000011','c0000000-0000-0000-0000-000000000011','Q2 2026'),
  ('d0000000-0000-0000-0000-000000000012','c0000000-0000-0000-0000-000000000012','2025 Batch 2'),
  ('d0000000-0000-0000-0000-000000000021','c0000000-0000-0000-0000-000000000021','Q2 2026'),
  ('d0000000-0000-0000-0000-000000000031','c0000000-0000-0000-0000-000000000031','Q2 2026'),
  ('d0000000-0000-0000-0000-000000000041','c0000000-0000-0000-0000-000000000041','Q2 2026');

-- master checklists (trimmed) — stage stored in DB vocab ('Newbie')
insert into discipleship.master_checklist_items (stage, position, text) values
  ('Newbie',1,'Water baptism'),
  ('Newbie',2,'Join a Life Group'),
  ('Newbie',3,'Attend Sunday service 4 weeks in a row'),
  ('Growing',1,'Complete Victory Weekend'),
  ('Growing',2,'Serve in a ministry'),
  ('Leader',1,'Complete leadership training'),
  ('Leader',2,'Facilitate a Life Group');

-- snapshot each disciple's checklist for its current DB stage
do $$ begin
  perform discipleship.snapshot_checklist('d0000000-0000-0000-0000-000000000011','Newbie');
  perform discipleship.snapshot_checklist('d0000000-0000-0000-0000-000000000012','Growing');
  perform discipleship.snapshot_checklist('d0000000-0000-0000-0000-000000000021','Growing');
  perform discipleship.snapshot_checklist('d0000000-0000-0000-0000-000000000031','Growing');
  perform discipleship.snapshot_checklist('d0000000-0000-0000-0000-000000000041','Growing');
end $$;

-- ── activity ────────────────────────────────────────────────────────────────
-- Arnel: personal touch 3 days ago             → green
-- Cheska: Sunday Service 41 days ago           → red
-- Anselmo: Sunday Service YESTERDAY only       → must STAY red (the new rule)
insert into discipleship.activity_logs (disciple_id, type, occurred_on, created_by) values
  ('d0000000-0000-0000-0000-000000000011','Life Group',     current_date - 3,  'a0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000021','Sunday Service', current_date - 41, 'a0000000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000041','Sunday Service', current_date - 1,  'a0000000-0000-0000-0000-000000000004');

-- ── QR service attendance fixture (the directory's module) ──────────────────
-- 12 Sunday sessions; Arnel attended 5 of them (weeks 0,1,2,4,6 back).
insert into public.service_types (id, name, slug) values
  ('70000000-0000-0000-0000-000000000001','Family Sunday Service','family-sunday');

do $$
declare
  v_sun date := (timezone('Asia/Manila', now())::date)
                - extract(dow from timezone('Asia/Manila', now())::date)::int;
  v_session uuid;
  i int;
begin
  for i in 0..11 loop
    v_session := gen_random_uuid();
    insert into public.service_sessions (id, service_type_id, session_date, qr_token, is_open)
    values (v_session, '70000000-0000-0000-0000-000000000001', v_sun - (i * 7), 'tok-' || i, false);

    if i in (0, 1, 2, 4, 6) then
      insert into public.attendance_records (session_id, member_id, checkin_method, match_status)
      values (v_session, 'c0000000-0000-0000-0000-000000000011', 'qr_self', 'auto_matched');
    end if;
  end loop;

  -- Anselmo was at church yesterday-ish too (most recent Sunday) — proves
  -- attendance shows up in the sparkline while the queue still calls for him.
  insert into public.attendance_records (session_id, member_id, checkin_method, match_status)
  select id, 'c0000000-0000-0000-0000-000000000041', 'qr_self', 'auto_matched'
  from public.service_sessions where session_date = v_sun;
end $$;
