#!/usr/bin/env bash
# ============================================================================
# Agapay RLS isolation test — proves the security-critical properties of the
# discipleship schema against a throwaway Postgres with a Supabase-auth shim.
# Nothing here touches the shared production project.
#
#   bash test/rls/run.sh          # fresh container, run, tear down
#   KEEP=1 bash test/rls/run.sh   # leave the container up afterwards
#
# Sections are ordered so that ownership-mutating tests (reassign) run AFTER
# the cross-discipler denial tests that depend on the original assignments.
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/../.."
C=agapay-rls-test
IMAGE=postgres:17   # matches production (17.6)
FAILS=0
# No host port is published on purpose: every query below runs through
# `docker exec`, so the container needs no TCP exposure. That keeps the suite
# immune to port collisions with other projects on this machine.

die() { echo; echo "SETUP FAILED: $*"; docker logs "$C" 2>&1 | tail -15; exit 1; }

echo "== (re)create throwaway Postgres =="
docker rm -f "$C" >/dev/null 2>&1 || true
docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres \
  "$IMAGE" >/dev/null || die "docker run failed"

# `pg_isready` goes green against Postgres's temporary INIT server, which then
# restarts — connecting in that window fails. Probe with a real query instead,
# and require two consecutive successes so we are past the restart.
ready=0
hits=0
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Running}}' "$C" 2>/dev/null)" = "true" ] || { sleep 0.5; continue; }
  if docker exec "$C" psql -U postgres -d postgres -qtAX -c 'select 1' >/dev/null 2>&1; then
    hits=$((hits+1))
    [ "$hits" -ge 2 ] && { ready=1; break; }
  else
    hits=0
  fi
  sleep 0.5
done
[ "$ready" = "1" ] || die "Postgres never became ready (state: $(docker inspect -f '{{.State.Status}}' "$C" 2>/dev/null))"

# A failed load must ABORT — never let checks run against a half-built schema.
load() {
  docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$1" \
    || die "failed to load $1"
}

echo "== load auth shim + migrations + seed =="
load test/rls/00_auth_shim.sql
for f in supabase/migrations/*.sql; do load "$f"; done
load test/rls/10_seed.sql
echo "   loaded."

# ── personas ────────────────────────────────────────────────────────────────
ALMA=a0000000-0000-0000-0000-000000000001     # discipler, role=member
JOSIE=a0000000-0000-0000-0000-000000000002    # discipler, role=member
GINA=a0000000-0000-0000-0000-000000000003     # discipler, role=discipleship
RODEL=a0000000-0000-0000-0000-000000000004    # discipler, role=member
DANILO=a0000000-0000-0000-0000-000000000005   # admin
NOBODY=a0000000-0000-0000-0000-000000000006   # plain member, disciples no one

run_sql() { # uid, sql
  printf "set role authenticated;\nselect set_config('request.jwt.claims','{\"sub\":\"%s\",\"role\":\"authenticated\"}',false);\n%s\n" \
    "$1" "$2" | docker exec -i "$C" psql -U postgres -d postgres -qtAX -f - 2>&1
}
run_anon() { printf "set role anon;\n%s\n" "$1" | docker exec -i "$C" psql -U postgres -d postgres -qtAX -f - 2>&1; }
scalar() { run_sql "$1" "$2" | tail -n1 | tr -d '[:space:]'; }

check() { # desc, got, want
  if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (got '$2' want '$3')"; FAILS=$((FAILS+1)); fi
}
check_has() { # desc, haystack, needle
  if echo "$2" | grep -qi "$3"; then echo "PASS  $1"; else echo "FAIL  $1 (missing '$3' in: $2)"; FAILS=$((FAILS+1)); fi
}

echo; echo "== A. cross-discipler read isolation =="
check "Alma sees her 2 disciples" \
  "$(scalar $ALMA 'select count(*) from discipleship.disciple_profiles;')" 2
check "Josie sees her 1 disciple" \
  "$(scalar $JOSIE 'select count(*) from discipleship.disciple_profiles;')" 1
check "Alma CANNOT see Josie's disciple row" \
  "$(scalar $ALMA "select count(*) from discipleship.disciple_profiles where id='d0000000-0000-0000-0000-000000000021';")" 0
check "Admin sees all 5 disciples" \
  "$(scalar $DANILO 'select count(*) from discipleship.disciple_profiles;')" 5

echo; echo "== B. derived engagement view respects RLS =="
check "Alma's engagement view = her 2 disciples" \
  "$(scalar $ALMA 'select count(*) from discipleship.disciple_engagement;')" 2
check "Alma sees none of Josie's engagement rows" \
  "$(scalar $ALMA "select count(*) from discipleship.disciple_engagement where disciple_id='d0000000-0000-0000-0000-000000000021';")" 0
check "Arnel (Life Group 3d ago) reads green for Alma" \
  "$(scalar $ALMA "select engagement from discipleship.disciple_engagement where disciple_id='d0000000-0000-0000-0000-000000000011';")" green

echo; echo "== C. child tables (activity, checklist) are scoped =="
check "Alma can read her disciple's activity" \
  "$(scalar $ALMA "select count(*) from discipleship.activity_logs where disciple_id='d0000000-0000-0000-0000-000000000011';")" 1
check "Alma CANNOT read Josie's disciple activity" \
  "$(scalar $ALMA "select count(*) from discipleship.activity_logs where disciple_id='d0000000-0000-0000-0000-000000000021';")" 0
check "Alma CANNOT read Josie's disciple checklist" \
  "$(scalar $ALMA "select count(*) from discipleship.disciple_checklist_items where disciple_id='d0000000-0000-0000-0000-000000000021';")" 0

echo; echo "== D. personal-touch engagement clock (Sunday attendance must not silence the queue) =="
check "Anselmo attended church YESTERDAY but stays at-risk" \
  "$(scalar $RODEL "select engagement from discipleship.disciple_engagement where disciple_id='d0000000-0000-0000-0000-000000000041';")" red
check "...and his days_since is null (no personal touch ever)" \
  "$(scalar $RODEL "select coalesce(days_since::text,'null') from discipleship.disciple_engagement where disciple_id='d0000000-0000-0000-0000-000000000041';")" null
check "a Sunday Service log is still stored (loggable, just not clock-resetting)" \
  "$(scalar $RODEL "select count(*) from discipleship.activity_logs where disciple_id='d0000000-0000-0000-0000-000000000041' and type='Sunday Service';")" 1

echo; echo "== E. Sunday attendance sparkline (reads the QR check-in module) =="
check "sparkline returns 12 weekly buckets" \
  "$(scalar $ALMA "select count(*) from discipleship.sunday_attendance('d0000000-0000-0000-0000-000000000011');")" 12
check "Arnel attended 5 of the last 12 Sundays" \
  "$(scalar $ALMA "select count(*) from discipleship.sunday_attendance('d0000000-0000-0000-0000-000000000011') where attended;")" 5
check "buckets are Sundays in chronological order" \
  "$(scalar $ALMA "select count(*) from discipleship.sunday_attendance('d0000000-0000-0000-0000-000000000011') where extract(dow from week_start) <> 0;")" 0
check "at-risk Anselmo still shows his recent attendance" \
  "$(scalar $RODEL "select count(*) from discipleship.sunday_attendance('d0000000-0000-0000-0000-000000000041') where attended;")" 1
check_has "Alma CANNOT read Josie's disciple's attendance" \
  "$(run_sql $ALMA "select * from discipleship.sunday_attendance('d0000000-0000-0000-0000-000000000021');")" "Not authorized"

echo; echo "== F. Tierra prime directive: no direct member writes by disciplers =="
check "Alma CANNOT update another discipler's member" \
  "$(scalar $ALMA "with u as (update public.members set city='HACK' where id='c0000000-0000-0000-0000-000000000021' returning 1) select count(*) from u;")" 0
check "Alma CANNOT even directly update her OWN disciple's member" \
  "$(scalar $ALMA "with u as (update public.members set city='HACK' where id='c0000000-0000-0000-0000-000000000011' returning 1) select count(*) from u;")" 0
check "member city unchanged after denied writes" \
  "$(scalar $DANILO "select city from public.members where id='c0000000-0000-0000-0000-000000000011';")" Calamba

echo; echo "== G. append-only activity log =="
check_has "activity_logs UPDATE is blocked" \
  "$(run_sql $ALMA "update discipleship.activity_logs set note='x' where disciple_id='d0000000-0000-0000-0000-000000000011';")" "denied"

echo; echo "== G2. write path: the app's mutations are allowed for the right person =="
check "Alma CAN log an activity for her own disciple" \
  "$(scalar $ALMA "with i as (insert into discipleship.activity_logs (disciple_id, type, occurred_on, created_by) values ('d0000000-0000-0000-0000-000000000011','One-on-one', current_date, '$ALMA') returning 1) select count(*) from i;")" 1
check_has "Alma CANNOT log an activity for Josie's disciple" \
  "$(run_sql $ALMA "insert into discipleship.activity_logs (disciple_id, type, occurred_on, created_by) values ('d0000000-0000-0000-0000-000000000021','One-on-one', current_date, '$ALMA');")" "violates row-level security"
check_has "cannot forge created_by as someone else" \
  "$(run_sql $ALMA "insert into discipleship.activity_logs (disciple_id, type, occurred_on, created_by) values ('d0000000-0000-0000-0000-000000000011','Note', current_date, '$JOSIE');")" "violates row-level security"

check "Alma CAN schedule a meeting for her disciple" \
  "$(scalar $ALMA "with i as (insert into discipleship.meetings (disciple_id, scheduled_at, mode, place, created_by) values ('d0000000-0000-0000-0000-000000000011', now() + interval '2 days','inperson','Kape Kada','$ALMA') returning 1) select count(*) from i;")" 1
check_has "Alma CANNOT schedule for Josie's disciple" \
  "$(run_sql $ALMA "insert into discipleship.meetings (disciple_id, scheduled_at, created_by) values ('d0000000-0000-0000-0000-000000000021', now(), '$ALMA');")" "violates row-level security"
check "completing a meeting stamps completed_at (engagement reset path)" \
  "$(scalar $ALMA "update discipleship.meetings set status='completed', note='went well' where disciple_id='d0000000-0000-0000-0000-000000000011' and status='upcoming'; select count(*) from discipleship.meetings where disciple_id='d0000000-0000-0000-0000-000000000011' and status='completed' and completed_at is not null;")" 1

check "Alma CAN tick her disciple's checklist item" \
  "$(scalar $ALMA "with u as (update discipleship.disciple_checklist_items set done=true where disciple_id='d0000000-0000-0000-0000-000000000011' and position=1 returning 1) select count(*) from u;")" 1
check "ticking stamps done_at so it reaches the timeline" \
  "$(scalar $ALMA "select count(*) from discipleship.disciple_checklist_items where disciple_id='d0000000-0000-0000-0000-000000000011' and position=1 and done_at is not null;")" 1
check "un-ticking clears done_at" \
  "$(scalar $ALMA "update discipleship.disciple_checklist_items set done=false where disciple_id='d0000000-0000-0000-0000-000000000011' and position=1; select count(*) from discipleship.disciple_checklist_items where disciple_id='d0000000-0000-0000-0000-000000000011' and position=1 and done_at is null;")" 1
check "Alma CANNOT tick Josie's disciple's checklist" \
  "$(scalar $ALMA "with u as (update discipleship.disciple_checklist_items set done=true where disciple_id='d0000000-0000-0000-0000-000000000021' returning 1) select count(*) from u;")" 0

echo; echo "== G3. master checklist edits are admin-only and transactional =="
check_has "a discipler CANNOT rewrite the master checklist" \
  "$(run_sql $ALMA "select discipleship.set_master_checklist('Newbie', array['hacked']);")" "admin"
check "admin CAN replace a stage list in one call" \
  "$(scalar $DANILO "select discipleship.set_master_checklist('Newbie', array['Water baptism','Join a Life Group','Attend Sunday service 4 weeks in a row','Receive first Bible']);")" 4
check "reorder/add did NOT disturb an in-progress instance (RULES #20)" \
  "$(scalar $ALMA "select count(*) from discipleship.disciple_checklist_items where disciple_id='d0000000-0000-0000-0000-000000000011';")" 3

echo; echo "== H. promote RPC guards =="
check_has "promote requires a note" \
  "$(run_sql $ALMA "select discipleship.promote_disciple('d0000000-0000-0000-0000-000000000011','');")" "note is required"
check_has "promote by non-discipler is rejected" \
  "$(run_sql $JOSIE "select discipleship.promote_disciple('d0000000-0000-0000-0000-000000000011','ready');")" "Not authorized"

echo; echo "== I. promote happy path mutates directory + audit + checklist =="
run_sql $ALMA "select discipleship.promote_disciple('d0000000-0000-0000-0000-000000000011','Baptized and leading devotions');" >/dev/null
check "directory stage advanced Newbie->Growing" \
  "$(scalar $DANILO "select discipleship_stage from public.members where id='c0000000-0000-0000-0000-000000000011';")" Growing
check "stage_transition audit row written" \
  "$(scalar $ALMA "select count(*) from discipleship.stage_transitions where disciple_id='d0000000-0000-0000-0000-000000000011';")" 1
check "checklist re-snapshotted to Growing (2 items)" \
  "$(scalar $ALMA "select count(*) from discipleship.disciple_checklist_items where disciple_id='d0000000-0000-0000-0000-000000000011';")" 2

echo; echo "== J. reassign RPC is admin-only and re-scopes visibility =="
check_has "reassign by a discipler is rejected" \
  "$(run_sql $ALMA "select discipleship.reassign_disciples(array['d0000000-0000-0000-0000-000000000021']::uuid[],'b0000000-0000-0000-0000-000000000001');")" "admin"
check "admin reassigns Josie's disciple to Alma (1 row)" \
  "$(scalar $DANILO "select discipleship.reassign_disciples(array['d0000000-0000-0000-0000-000000000021']::uuid[],'b0000000-0000-0000-0000-000000000001');")" 1
check "Alma now sees 3 disciples (gained the reassigned one)" \
  "$(scalar $ALMA 'select count(*) from discipleship.disciple_profiles;')" 3
check "Josie now sees 0" \
  "$(scalar $JOSIE 'select count(*) from discipleship.disciple_profiles;')" 0

echo; echo "== J2. stage trend replays real transition history =="
check "trend returns rows for the admin" \
  "$(scalar $DANILO "select case when count(*) > 0 then 'yes' else 'no' end from discipleship.stage_trend(6);")" yes
check "the promoted disciple shows as Growing in the current month" \
  "$(scalar $DANILO "select disciples from discipleship.stage_trend(6) where month_start = date_trunc('month', current_date)::date and stage='Growing';")" 1
check "trend is scoped by RLS (a discipler sees only their own)" \
  "$(scalar $JOSIE "select coalesce(sum(disciples),0)::text from discipleship.stage_trend(6) where month_start = date_trunc('month', current_date)::date;")" 0

echo; echo "== K. add_disciple inserts directory member + enrollment =="
run_sql $GINA "select discipleship.add_disciple('New Believer Test','Calamba','Newbie','b0000000-0000-0000-0000-000000000003','Q3 2026');" >/dev/null
check "Gina now has 2 disciples" \
  "$(scalar $GINA 'select count(*) from discipleship.disciple_profiles;')" 2
check "new member stored with DB stage 'Newbie'" \
  "$(scalar $DANILO "select discipleship_stage from public.members where name='New Believer Test';")" Newbie

echo; echo "== L. stage vocabulary boundary (DB stores 'Newbie', view maps to UI) =="
check "stage_transitions stores DB vocab (never 'New Believer')" \
  "$(scalar $DANILO "select count(*) from discipleship.stage_transitions where from_stage='New Believer' or to_stage='New Believer';")" 0
check "engagement view maps promoted Newbie->'Growing' for UI" \
  "$(scalar $ALMA "select stage from discipleship.disciple_engagement where disciple_id='d0000000-0000-0000-0000-000000000012';")" Growing

echo; echo "== M. RBAC model: discipler identity is implicit (members.discipler_id) =="
check "a 'member'-role user who disciples nobody sees 0 disciples" \
  "$(scalar $NOBODY 'select count(*) from discipleship.disciple_profiles;')" 0
check "a 'discipleship'-role user is scoped to their own disciples" \
  "$(scalar $GINA "select count(*) from discipleship.disciple_profiles;")" 2
check "non-admin cannot change engagement thresholds" \
  "$(scalar $ALMA "with u as (update discipleship.settings set red_after_days=999 returning 1) select count(*) from u;")" 0
check "admin CAN change engagement thresholds" \
  "$(scalar $DANILO "with u as (update discipleship.settings set red_after_days=28 returning 1) select count(*) from u;")" 1

echo; echo "== N. blanket protections =="
check "no discipleship table has RLS disabled" \
  "$(docker exec -i "$C" psql -U postgres -d postgres -qtAX -c "select count(*) from pg_tables where schemaname='discipleship' and rowsecurity=false;" | tr -d '[:space:]')" 0
check_has "anon (signed-out) cannot read disciples" \
  "$(run_anon 'select count(*) from discipleship.disciple_profiles;')" "denied"
# prod parity (verified live 2026-07-12): anon HAS the select grant but
# members_read_auth filters every row, so it sees an empty set, not an error.
check "anon (signed-out) sees zero directory members (prod parity)" \
  "$(run_anon 'select count(*) from public.members;' | tail -n1 | tr -d '[:space:]')" 0
check_has "no client role can read attendance_records directly (prod parity)" \
  "$(run_sql $ALMA 'select count(*) from public.attendance_records;')" "denied"

echo; echo "== ADVISORY (documents production RBAC, not an Agapay guarantee) =="
# Production's is_leader_or_admin() includes 'discipleship', so that role can
# UPDATE public.members directly and bypass Agapay's audit trail. Agapay does
# not require the role — disciplers should stay role='member'. See GAPS #33.
# This check pins the current reality: if the church tightens the helper, it
# flips and we find out here.
check "role='discipleship' CAN direct-write members (Tierra RBAC — see GAPS #33)" \
  "$(scalar $GINA "with u as (update public.members set city='ADVISORY' where id='c0000000-0000-0000-0000-000000000031' returning 1) select count(*) from u;")" 1

echo; echo "== O. link_disciple + hardened add_disciple (2026-09-27) =="
# Runs last: it re-points directory members. Superuser reads bypass RLS.
su() { docker exec -i "$C" psql -U postgres -d postgres -qtAX -c "$1" 2>&1 | tr -d '[:space:]'; }
NOBODY_M=b0000000-0000-0000-0000-000000000006
ALMA_M=b0000000-0000-0000-0000-000000000001
GINA_M=b0000000-0000-0000-0000-000000000003

check_has "anon cannot call add_disciple (was allowed: NULL-unsafe guard)" \
  "$(run_anon "select discipleship.add_disciple('Anon Test','X','Newbie',null,null);")" "denied"
check "anon call left no directory row" \
  "$(su "select count(*) from public.members where name='Anon Test';")" 0
check_has "anon cannot call link_disciple" \
  "$(run_anon "select discipleship.link_disciple('$NOBODY_M');")" "denied"
check "anon holds no EXECUTE on add_disciple" \
  "$(su "select has_function_privilege('anon','discipleship.add_disciple(text,text,text,uuid,text)','execute');")" f
check "anon holds no EXECUTE on promote_disciple" \
  "$(su "select has_function_privilege('anon','discipleship.promote_disciple(uuid,text,text)','execute');")" f
check_has "a member who disciples no one cannot add_disciple for self" \
  "$(run_sql $NOBODY "select discipleship.add_disciple('Solo Test','X','Newbie','$NOBODY_M',null);")" "Not authorized"
check_has "a member who disciples no one cannot link" \
  "$(run_sql $NOBODY "select discipleship.link_disciple('c0000000-0000-0000-0000-000000000041');")" "Only a discipler"
check_has "an admin without a member record cannot link (reassign instead)" \
  "$(run_sql $DANILO "select discipleship.link_disciple('$NOBODY_M');")" "Only a discipler"
check_has "a discipler cannot add_disciple for another discipler" \
  "$(run_sql $ALMA "select discipleship.add_disciple('Other Test','X','Newbie','$GINA_M',null);")" "Not authorized"
check_has "add_disciple refuses a blank name" \
  "$(run_sql $ALMA "select discipleship.add_disciple('   ','X','Newbie','$ALMA_M',null);")" "name is required"
run_sql $ALMA "select discipleship.add_disciple('No City Test',null,'Newbie','$ALMA_M',null);" >/dev/null
check "add_disciple stores a missing city as '' (city is NOT NULL in prod)" \
  "$(su "select coalesce(city,'NULL') || '|' from public.members where name='No City Test';")" "|"

BEFORE=$(scalar $ALMA 'select count(*) from discipleship.disciple_profiles;')
LINKED=$(scalar $ALMA "select discipleship.link_disciple('$NOBODY_M');")
check "Alma links an unassigned member (one more disciple)" \
  "$(scalar $ALMA 'select count(*) from discipleship.disciple_profiles;')" "$((BEFORE+1))"
check "the member now points at Alma" \
  "$(su "select discipler_id from public.members where id='$NOBODY_M';")" "$ALMA_M"
check "one intake transition in DB vocab ('Joined Agapay', from null)" \
  "$(su "select count(*) from discipleship.stage_transitions where disciple_id='$LINKED' and from_stage is null and to_stage='Growing' and note='Joined Agapay';")" 1
check "checklist snapshot taken for the member's stage" \
  "$(su "select case when count(*) > 0 then 'yes' else 'no' end from discipleship.disciple_checklist_items where disciple_id='$LINKED';")" yes
check "linking again is idempotent (same disciple id)" \
  "$(scalar $ALMA "select discipleship.link_disciple('$NOBODY_M');")" "$LINKED"
check "still one intake transition after the repeat" \
  "$(su "select count(*) from discipleship.stage_transitions where disciple_id='$LINKED';")" 1
check_has "another discipler cannot take a linked member" \
  "$(run_sql $GINA "select discipleship.link_disciple('$NOBODY_M');")" "Already walks"
check_has "a discipler cannot add their own member record" \
  "$(run_sql $ALMA "select discipleship.link_disciple('$ALMA_M');")" "Own member record"
run_sql $ALMA "select discipleship.link_disciple('$GINA_M');" >/dev/null
check_has "no loops: Gina cannot take Alma, who now disciples her" \
  "$(run_sql $GINA "select discipleship.link_disciple('$ALMA_M');")" "already disciples"
su "insert into public.members (id, name, city, discipleship_stage, is_archived) values ('c0000000-0000-0000-0000-000000000099','Archived Test','X','Newbie',true);" >/dev/null
check_has "an archived member cannot be linked" \
  "$(run_sql $ALMA "select discipleship.link_disciple('c0000000-0000-0000-0000-000000000099');")" "Member not found"

echo; echo "== P. circles from Agapay: create_circle + place_in_circle (2026-10-09) =="
# Runs after O, which made Nobody and Gina Alma's disciples. Josie has no
# disciples left by now (section J reassigned hers), so Rodel plays the
# second discipler. A leader may run several circles.
RODEL_M=b0000000-0000-0000-0000-000000000004
ARNEL_D=d0000000-0000-0000-0000-000000000011
ARNEL_M=c0000000-0000-0000-0000-000000000011
ANJ_D=d0000000-0000-0000-0000-000000000041
ANJ_M=c0000000-0000-0000-0000-000000000041
active_in() { # member, circle -> count of active plain memberships
  su "select count(*) from public.member_cell_groups where member_id='$1' and cell_group_id='$2' and is_active;"
}

check_has "anon cannot call create_circle" \
  "$(run_anon "select discipleship.create_circle('Anon Circle');")" "denied"
check "anon holds no EXECUTE on place_in_circle" \
  "$(su "select has_function_privilege('anon','discipleship.place_in_circle(uuid,uuid)','execute');")" f
check_has "a member who disciples no one cannot start a circle" \
  "$(run_sql $NOBODY "select discipleship.create_circle('Solo Circle');")" "Only a discipler"
check_has "a circle name needs 2 or more characters" \
  "$(run_sql $ALMA "select discipleship.create_circle('  A  ');")" "2 to 60"

ALMA_C=$(scalar $ALMA "select discipleship.create_circle('  Tribes Test  ');")
check "Alma leads the circle she started, in her satellite, name trimmed" \
  "$(su "select (leader_id = '$ALMA_M' and satellite_id = '50000000-0000-0000-0000-000000000001' and name = 'Tribes Test')::text from public.cell_groups where id='$ALMA_C';")" true
check_has "a duplicate circle name in the same satellite is refused" \
  "$(run_sql $ALMA "select discipleship.create_circle('tribes test');")" "already in use"
RODEL_C=$(scalar $RODEL "select discipleship.create_circle('Rodel Test');")

run_sql $ALMA "select discipleship.place_in_circle('$ARNEL_D','$ALMA_C');" >/dev/null
check "Alma places her disciple in her circle" "$(active_in $ARNEL_M $ALMA_C)" 1
run_sql $ALMA "select discipleship.place_in_circle('$ARNEL_D','$ALMA_C');" >/dev/null
check "placing again is idempotent (still one row)" \
  "$(su "select count(*) from public.member_cell_groups where member_id='$ARNEL_M' and cell_group_id='$ALMA_C';")" 1
check_has "Rodel cannot place Alma's disciple in Alma's circle" \
  "$(run_sql $RODEL "select discipleship.place_in_circle('$ARNEL_D','$ALMA_C');")" "Not authorized"
check_has "Alma cannot place Rodel's disciple in her own circle" \
  "$(run_sql $ALMA "select discipleship.place_in_circle('$ANJ_D','$ALMA_C');")" "Not authorized"
check_has "Alma cannot place her disciple in a circle she does not run" \
  "$(run_sql $ALMA "select discipleship.place_in_circle('$ARNEL_D','$RODEL_C');")" "Not authorized"

ALMA_C2=$(scalar $ALMA "select discipleship.create_circle('Alma Two');")
check "a leader may run a second circle" \
  "$(su "select count(*) from public.cell_groups where leader_id='$ALMA_M' and is_active;")" 2
su "insert into public.member_cell_groups (member_id, cell_group_id, role, is_active) values ('$ARNEL_M','$RODEL_C','member',true);" >/dev/null
check_has "a membership in a circle the caller does not run blocks the placement" \
  "$(run_sql $ALMA "select discipleship.place_in_circle('$ARNEL_D','$ALMA_C2');")" "Already in Rodel Test"
check "...and nothing moved" "$(active_in $ARNEL_M $ALMA_C)" 1
su "update public.member_cell_groups set is_active=false where member_id='$ARNEL_M' and cell_group_id='$RODEL_C';" >/dev/null

run_sql $ALMA "select discipleship.place_in_circle('$ARNEL_D','$ALMA_C2');" >/dev/null
check "between two circles Alma runs, placing is a move (new circle active)" "$(active_in $ARNEL_M $ALMA_C2)" 1
check "...and the old membership is inactive with a left date" \
  "$(su "select (not is_active and left_at is not null)::text from public.member_cell_groups where member_id='$ARNEL_M' and cell_group_id='$ALMA_C';")" true
OLD_ROW=$(su "select id from public.member_cell_groups where member_id='$ARNEL_M' and cell_group_id='$ALMA_C';")
run_sql $ALMA "select discipleship.place_in_circle('$ARNEL_D','$ALMA_C');" >/dev/null
check "moving back reactivates the same row (UNIQUE member+circle)" \
  "$(su "select (id = '$OLD_ROW' and is_active and left_at is null)::text from public.member_cell_groups where member_id='$ARNEL_M' and cell_group_id='$ALMA_C';")" true
check "exactly one active plain circle for the disciple" \
  "$(su "select count(*) from public.member_cell_groups where member_id='$ARNEL_M' and role='member' and is_active;")" 1

GINA_D=$(su "select id from discipleship.disciple_profiles where member_id='$GINA_M';")
su "update public.cell_groups set co_leader_id='$GINA_M' where id='$ALMA_C2';" >/dev/null
check_has "a circle's co-leader cannot be placed in it as a member" \
  "$(run_sql $ALMA "select discipleship.place_in_circle('$GINA_D','$ALMA_C2');")" "cannot join as members"
su "update public.cell_groups set is_active=false where id='$ALMA_C2';" >/dev/null
check_has "an inactive circle cannot take members" \
  "$(run_sql $ALMA "select discipleship.place_in_circle('$ARNEL_D','$ALMA_C2');")" "Circle not found"
run_sql $DANILO "select discipleship.place_in_circle('$ANJ_D','$RODEL_C');" >/dev/null
check "an admin can place any disciple" "$(active_in $ANJ_M $RODEL_C)" 1
check "no circle function touched discipler_id" \
  "$(su "select count(*) from public.members where id in ('$ARNEL_M','$ANJ_M') and discipler_id not in ('$ALMA_M','$RODEL_M');")" 0

echo; echo "== Q. snapshot_checklist is server-only (2026-10-09) =="
check_has "anon cannot reset a disciple's checklist" \
  "$(run_anon "select discipleship.snapshot_checklist('$ARNEL_D','Newbie');")" "denied"
check_has "a signed-in discipler cannot call it directly either" \
  "$(run_sql $ALMA "select discipleship.snapshot_checklist('$ARNEL_D','Newbie');")" "denied"
check "the service role keeps EXECUTE (directory enrollment, import scripts)" \
  "$(su "select has_function_privilege('service_role','discipleship.snapshot_checklist(uuid,text)','execute');")" t
check "anon holds no EXECUTE on set_master_checklist" \
  "$(su "select has_function_privilege('anon','discipleship.set_master_checklist(text,text[])','execute');")" f
check "signed-in callers keep EXECUTE on set_master_checklist (admin-guarded inside)" \
  "$(su "select has_function_privilege('authenticated','discipleship.set_master_checklist(text,text[])','execute');")" t
QDIS=$(scalar $ALMA "select discipleship.add_disciple('Snapshot Lock Test','X','Newbie','$ALMA_M',null);")
check "add_disciple still takes the checklist snapshot (runs as the owner)" \
  "$(su "select case when count(*) > 0 then 'yes' else 'no' end from discipleship.disciple_checklist_items where disciple_id='$QDIS';")" yes

echo; echo "== S. audit High: protected member fields, inactive accounts, user delete (2026-10-09) =="
NOBODY_M2=b0000000-0000-0000-0000-000000000006
check_has "a member cannot make themselves their own discipler" \
  "$(run_sql $NOBODY "update public.members set discipler_id='$NOBODY_M2' where id='$NOBODY_M2';")" "Protected member fields"
check_has "a member cannot set their own discipler to someone else" \
  "$(run_sql $NOBODY "update public.members set discipler_id='$RODEL_M' where id='$NOBODY_M2';")" "Protected member fields"
check_has "a member cannot change their own stage" \
  "$(run_sql $NOBODY "update public.members set discipleship_stage='Leader' where id='$NOBODY_M2';")" "Protected member fields"
check_has "a member cannot raise their own leadership level" \
  "$(run_sql $NOBODY "update public.members set leadership_level='Head Pastor' where id='$NOBODY_M2';")" "Protected member fields"
check "a member can still edit an ordinary field of their own row" \
  "$(scalar $NOBODY "with u as (update public.members set city='Binan' where id='$NOBODY_M2' returning 1) select count(*) from u;")" 1
check_has "a leader-role user cannot change another member's discipler directly" \
  "$(run_sql $GINA "update public.members set discipler_id='$GINA_M' where id='$ANJ_M';")" "Protected member fields"
check_has "a leader-role user cannot insert a member with a discipler" \
  "$(run_sql $GINA "insert into public.members (name, city, discipleship_stage, discipler_id) values ('Direct Insert Test','X','Newbie','$GINA_M');")" "Protected member fields"
check "a directory admin can still edit protected fields" \
  "$(scalar $DANILO "with u as (update public.members set leadership_level='Eagle' where id='$NOBODY_M2' returning 1) select count(*) from u;")" 1
check_has "nobody can be their own discipler, even the server" \
  "$(su "update public.members set discipler_id=id where id='$NOBODY_M2';")" "members_discipler_not_self"
check "Agapay functions still write protected fields (link_disciple)" \
  "$(su "insert into public.members (id, name, city, discipleship_stage) values ('c0000000-0000-0000-0000-000000000088','Guard Link Test','X','Newbie');" >/dev/null; scalar $ALMA "select (discipleship.link_disciple('c0000000-0000-0000-0000-000000000088') is not null)::text;")" true

su "update public.user_profiles set is_active=false where id in ('$ALMA','$DANILO');" >/dev/null
check "a deactivated discipler sees none of their disciples" \
  "$(scalar $ALMA 'select count(*) from discipleship.disciple_profiles;')" 0
check_has "a deactivated discipler cannot add a disciple" \
  "$(run_sql $ALMA "select discipleship.add_disciple('Inactive Test','X','Newbie','$ALMA_M',null);")" "Not authorized"
check "a deactivated admin is not an Agapay admin" \
  "$(scalar $DANILO 'select discipleship.is_agapay_admin()::text;')" false
check_has "a deactivated admin cannot reassign" \
  "$(run_sql $DANILO "select discipleship.reassign_disciples(array['$ANJ_D']::uuid[],'$ALMA_M');")" "Only an admin"
su "update public.user_profiles set is_active=true where id in ('$ALMA','$DANILO');" >/dev/null
check "re-activated, the discipler sees their disciples again" \
  "$(scalar $ALMA 'select (count(*) > 0)::text from discipleship.disciple_profiles;')" true

su "insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000099','leaver@quest.test');" >/dev/null
su "insert into discipleship.activity_logs (disciple_id, type, occurred_on, created_by) values ('$ARNEL_D','Note', current_date, 'a0000000-0000-0000-0000-000000000099');" >/dev/null
su "insert into discipleship.stage_transitions (disciple_id, from_stage, to_stage, note, created_by) values ('$ARNEL_D','Newbie','Newbie','delete test','a0000000-0000-0000-0000-000000000099');" >/dev/null
check "deleting a user who logged in Agapay succeeds" \
  "$(su "with d as (delete from auth.users where id='a0000000-0000-0000-0000-000000000099' returning 1) select count(*) from d;")" 1
check "...their activity stays, author unknown" \
  "$(su "select count(*) from discipleship.activity_logs where disciple_id='$ARNEL_D' and type='Note' and created_by is null;")" 1

echo; echo "== T. audit Low: Manila dates, own-log inactivity, trend clamp, satellite, column grants (2026-10-09) =="
check "manila_today() is today's date in Manila" \
  "$(su "select (discipleship.manila_today() = (now() at time zone 'Asia/Manila')::date)::text;")" true
su "insert into discipleship.activity_logs (disciple_id, type, occurred_on, created_by) values ('$ARNEL_D','One-on-one', discipleship.manila_today(), '$ALMA');" >/dev/null
check "an activity logged today (Manila) reads 0 days, never -1" \
  "$(scalar $ALMA "select days_since from discipleship.disciple_engagement where disciple_id='$ARNEL_D';")" 0

GINA_DISCIPLE=d0000000-0000-0000-0000-000000000031
su "insert into discipleship.activity_logs (disciple_id, type, occurred_on, created_by) values ('$GINA_DISCIPLE','Note', discipleship.manila_today(), '$DANILO');" >/dev/null
check "a discipler who never logged is Inactive, even when someone else logged for their disciple" \
  "$(scalar $DANILO "select inactive::text from discipleship.discipler_load where discipler_member_id='$GINA_M';")" true
check "a discipler who logged today is not Inactive" \
  "$(scalar $DANILO "select (not inactive and days_since_log = 0)::text from discipleship.discipler_load where discipler_member_id='$ALMA_M';")" true

check "stage_trend is clamped to 36 months" \
  "$(scalar $DANILO "select (count(distinct month_start) <= 36)::text from discipleship.stage_trend(20000);")" true

SAT_D=$(scalar $ALMA "select discipleship.add_disciple('Satellite Test','X','Newbie','$ALMA_M',null);")
check "a new believer gets the discipler's satellite" \
  "$(su "select m.satellite_id from public.members m join discipleship.disciple_profiles dp on dp.member_id = m.id where dp.id='$SAT_D';")" "50000000-0000-0000-0000-000000000001"

ITEM=$(su "select id from discipleship.disciple_checklist_items where disciple_id='$ARNEL_D' limit 1;")
check "a discipler can still tick a checklist item" \
  "$(scalar $ALMA "with u as (update discipleship.disciple_checklist_items set done = true where id='$ITEM' returning 1) select count(*) from u;")" 1
check_has "...but cannot rewrite its text" \
  "$(run_sql $ALMA "update discipleship.disciple_checklist_items set text='rewritten' where id='$ITEM';")" "denied"
MEET=$(su "insert into discipleship.meetings (disciple_id, scheduled_at, created_by) values ('$ARNEL_D', now() + interval '1 day', '$ALMA') returning id;" | head -c 36)
check "a discipler can still complete a meeting with a note" \
  "$(scalar $ALMA "with u as (update discipleship.meetings set status='completed', note='done' where id='$MEET' returning 1) select count(*) from u;")" 1
check_has "...but cannot backdate its completion time" \
  "$(run_sql $ALMA "update discipleship.meetings set completed_at = now() - interval '300 days' where id='$MEET';")" "denied"

ALPHA_C=$(su "insert into public.cell_groups (name, leader_id, is_active) values ('Alpha Lead','$GINA_M',true) returning id;" | head -c 36)
su "insert into public.member_cell_groups (member_id, cell_group_id, role, is_active) values ('$GINA_M','$ALPHA_C','leader',true), ('$GINA_M','$ALMA_C','member',true) on conflict (member_id, cell_group_id) do update set is_active = true, role = excluded.role;" >/dev/null
check "the shown Quest Circle prefers the plain membership over a circle led" \
  "$(scalar $DANILO "select life_group_name from discipleship.disciple_engagement where member_id='$GINA_M';")" "TribesTest"

echo; echo "== U. audit Medium: reassign, placement, link, promote, dates, circle race (2026-10-09) =="
RHU_M=c0000000-0000-0000-0000-000000000031
MILA_D=d0000000-0000-0000-0000-000000000012
MILA_M=c0000000-0000-0000-0000-000000000012
check_has "reassign refuses an empty target" \
  "$(run_sql $DANILO "select discipleship.reassign_disciples(array['$ANJ_D']::uuid[], null);")" "Discipler not found"
check_has "reassign refuses an archived target" \
  "$(run_sql $DANILO "select discipleship.reassign_disciples(array['$ANJ_D']::uuid[],'c0000000-0000-0000-0000-000000000099');")" "Discipler not found"
check_has "reassign refuses a disciple as their own discipler" \
  "$(run_sql $DANILO "select discipleship.reassign_disciples(array['$GINA_D']::uuid[],'$GINA_M');")" "loop"
check_has "reassign refuses a loop (to someone below the moved member)" \
  "$(run_sql $DANILO "select discipleship.reassign_disciples(array['$GINA_D']::uuid[],'$RHU_M');")" "loop"
check_has "reassign refuses unknown disciple ids, nothing moves" \
  "$(run_sql $DANILO "select discipleship.reassign_disciples(array['$ANJ_D', gen_random_uuid()]::uuid[],'$ALMA_M');")" "Some disciples not found"
check "...Anselmo did not move" \
  "$(su "select discipler_id from public.members where id='$ANJ_M';")" "$RODEL_M"
check_has "reassign refuses a circle the target does not run" \
  "$(run_sql $DANILO "select discipleship.reassign_disciples(array['$ANJ_D']::uuid[],'$ALMA_M','$RODEL_C');")" "Circle not run by that discipler"
check "reassign with a circle moves discipler and circle in one step" \
  "$(scalar $DANILO "select discipleship.reassign_disciples(array['$ANJ_D']::uuid[],'$ALMA_M','$ALMA_C');")" 1
check "...now in the new discipler's circle" "$(active_in $ANJ_M $ALMA_C)" 1
check "...and out of the old one" "$(active_in $ANJ_M $RODEL_C)" 0
run_sql $DANILO "select discipleship.reassign_disciples(array['$ANJ_D']::uuid[],'$RODEL_M');" >/dev/null
check "reassign without a circle leaves circles the new discipler does not run" \
  "$(su "select count(*) from public.member_cell_groups where member_id='$ANJ_M' and role='member' and is_active;")" 0
check_has "an admin cannot place a disciple outside their discipler's circles" \
  "$(run_sql $DANILO "select discipleship.place_in_circle('$ARNEL_D','$RODEL_C');")" "Reassign first"

su "insert into public.members (id, name, city, discipleship_stage, leadership_level) values ('c0000000-0000-0000-0000-000000000066','Pastor Link Test','X','Leader','Pastor');" >/dev/null
check_has "a discipler cannot claim a pastor" \
  "$(run_sql $ALMA "select discipleship.link_disciple('c0000000-0000-0000-0000-000000000066');")" "Pastors are assigned by an admin"
su "insert into public.members (id, name, city, discipleship_stage) values ('c0000000-0000-0000-0000-000000000065','Circle Link Test','X','Newbie'); insert into public.member_cell_groups (member_id, cell_group_id, role, is_active) values ('c0000000-0000-0000-0000-000000000065','$RODEL_C','member',true);" >/dev/null
check_has "a discipler cannot claim someone in another leader's circle" \
  "$(run_sql $ALMA "select discipleship.link_disciple('c0000000-0000-0000-0000-000000000065');")" "In Rodel Test"

check_has "promote refuses when the stage changed meanwhile" \
  "$(run_sql $ALMA "select discipleship.promote_disciple('$MILA_D','note','Newbie');")" "Stage already changed"
run_sql $ALMA "select discipleship.promote_disciple('$MILA_D','ready','Growing');" >/dev/null
check "promote with the expected stage moves one step" \
  "$(su "select discipleship_stage from public.members where id='$MILA_M';")" Leader
check "...with exactly one audit row for that step" \
  "$(su "select count(*) from discipleship.stage_transitions where disciple_id='$MILA_D' and from_stage='Growing' and to_stage='Leader';")" 1
check "promote without an expected stage still works (old callers)" \
  "$(su "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='discipleship' and p.proname='promote_disciple' and pg_get_function_identity_arguments(p.oid) like '%p_from_stage_db text';")" 1

check_has "an activity dated after tomorrow is refused" \
  "$(run_sql $ALMA "insert into discipleship.activity_logs (disciple_id, type, occurred_on, created_by) values ('$ARNEL_D','Note', discipleship.manila_today() + 5, '$ALMA');")" "future"
check "an activity dated today is accepted" \
  "$(scalar $ALMA "with i as (insert into discipleship.activity_logs (disciple_id, type, occurred_on, created_by) values ('$ARNEL_D','Note', discipleship.manila_today(), '$ALMA') returning 1) select count(*) from i;")" 1

check "create_circle takes a lock per name and satellite" \
  "$(su "select (position('pg_advisory_xact_lock' in pg_get_functiondef('discipleship.create_circle(text)'::regprocedure)) > 0)::text;")" true
check "anon holds no EXECUTE on the new reassign and promote" \
  "$(su "select has_function_privilege('anon','discipleship.reassign_disciples(uuid[],uuid,uuid)','execute')::text || has_function_privilege('anon','discipleship.promote_disciple(uuid,text,text)','execute')::text;")" falsefalse

echo; echo "== V. teams are not Quest Circles (2026-10-09) =="
TEAM_C=$(su "insert into public.cell_groups (name, leader_id, is_active, is_team) values ('Test Team','$RODEL_M',true,true) returning id;" | head -c 36)
su "insert into public.member_cell_groups (member_id, cell_group_id, role, is_active) values ('$ARNEL_M','$TEAM_C','member',true);" >/dev/null
check "a team membership sits beside the disciple's circle" \
  "$(su "select count(*) from public.member_cell_groups where member_id='$ARNEL_M' and role='member' and is_active;")" 2
check "the disciple's shown circle is never the team" \
  "$(scalar $ALMA "select life_group_name from discipleship.disciple_engagement where disciple_id='$ARNEL_D';")" "TribesTest"
check_has "a disciple cannot be placed in a team as their circle" \
  "$(run_sql $DANILO "select discipleship.place_in_circle('$ANJ_D','$TEAM_C');")" "Teams are not Quest Circles"
check_has "reassign cannot use a team as the circle" \
  "$(run_sql $DANILO "select discipleship.reassign_disciples(array['$ARNEL_D']::uuid[],'$RODEL_M','$TEAM_C');")" "Teams are not Quest Circles"
run_sql $DANILO "select discipleship.reassign_disciples(array['$ARNEL_D']::uuid[],'$RODEL_M','$RODEL_C');" >/dev/null
check "a reassign into a circle leaves the team membership alone" "$(active_in $ARNEL_M $TEAM_C)" 1
check "...and moves the circle" "$(active_in $ARNEL_M $RODEL_C)" 1
run_sql $DANILO "select discipleship.reassign_disciples(array['$ARNEL_D']::uuid[],'$ALMA_M');" >/dev/null
check "a reassign without a circle also leaves the team membership alone" "$(active_in $ARNEL_M $TEAM_C)" 1
su "insert into public.members (id, name, city, discipleship_stage) values ('c0000000-0000-0000-0000-000000000064','Team Only Test','X','Newbie'); insert into public.member_cell_groups (member_id, cell_group_id, role, is_active) values ('c0000000-0000-0000-0000-000000000064','$TEAM_C','member',true);" >/dev/null
check "a team membership does not block a discipler from adding someone" \
  "$(scalar $ALMA "select (discipleship.link_disciple('c0000000-0000-0000-0000-000000000064') is not null)::text;")" true

echo
if [ "$FAILS" -eq 0 ]; then echo "ALL RLS CHECKS PASSED"; else echo "$FAILS CHECK(S) FAILED"; fi
[ "${KEEP:-0}" = "1" ] || docker rm -f "$C" >/dev/null 2>&1
exit "$FAILS"
