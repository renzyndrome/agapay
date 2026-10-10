# Phase 1 — Discipleship schema, RLS & RPCs (data layer)

> Elaborates ROADMAP.md "Phase 1". This is the **security-critical** phase: it
> builds the entire persistence + authorization surface and proves it before any
> UI touches it. Nothing here renders a pixel; everything here is provable with
> `supabase db reset` + `supabase test db`.

**Prime directive (all phases, load-bearing here):** never modify Tierra's
schema, policies, or data **except** `public.members.discipleship_stage` /
`public.members.discipler_id` via `security definer` RPCs, plus minimal-member
`INSERT`s for brand-new believers. Every object Agapay owns lives in a dedicated
`discipleship` Postgres schema — no Tierra table is ever touched by name in a
migration.

**Grounding facts (verified live via Supabase MCP against project
`ncijotdkovijkcpqnlbv`, 2026-07-11 — authoritative over the repo SQL files):**
- `public.members.discipleship_stage` CHECK = `('Newbie','Growing','Leader')`.
  The live UI label "New Friends" is display-only; **the column stores `Newbie`.**
  Boundary mapping is therefore `Newbie ↔ New Believer` (never store or display
  "New Friends"; never store "New Believer").
- `public.members` has `discipler_id uuid → members(id)`, `discipleship_stage`,
  `is_archived`, `city TEXT NOT NULL`, `membership_status NOT NULL DEFAULT
  'active'`, `satellite_id`, `joined_date`, `photo_url`, `name NOT NULL`.
- Live members RLS: `members_read_auth` = `auth.role()='authenticated' AND NOT
  is_archived`; writes gated by Tierra roles (`members_insert_admin`,
  `members_update_self`, `members_delete_admin`). **A Tierra `cell_leader`/`member`
  cannot UPDATE an arbitrary member row** — this is what makes Model 1 safe.
- Schema `discipleship` does **not** exist yet. No auth trigger for Agapay exists;
  Tierra's `on_auth_user_created` already creates a `public.user_profiles` row for
  every new `auth.users` (harmless, expected — Agapay keeps its own role table).
- Remote already has 3 migrations (`drop_events_feature`,
  `production_security_hardening`, `revoke_anon_execute_on_definer_helpers`).
  Phase 1 adds **local-only** migrations; nothing is pushed to prod until Phase 6.

---

## 1. Objective

After this phase the shared Supabase project can store and authorize the entire
Agapay behavioral model — enrollments, checklist instances, activity logs,
meetings, milestones, and stage-transition audit — inside an isolated
`discipleship` schema, with row-level security that scopes every discipler to
**only their assigned disciples** and every write-back to the Tierra directory
through three locked-down `security definer` RPCs (`promote_disciple`,
`reassign_disciples`, `add_disciple`). Engagement, queue membership, checklist %,
and stage trends are exposed as **derived views** (never stored), and the whole
layer is provable by an automated RLS/RPC test suite before any UI consumes it.

## 2. Prerequisites

- **Phase 0 complete.** Requires: `supabase init` done (repo-root
  `supabase/config.toml`); `supabase db reset` boots a local stack with the
  **Tierra baseline migration** (`00000000000000_tierra_baseline.sql`)
  reconstructing `public` (members/cell_groups/user_profiles/…) so FKs resolve
  locally; baseline marked already-applied on remote via `supabase migration
  repair` so it can never execute against production; `.mcp.json` present (it is);
  the four `.claude/skills/` (`migration`, `feature-slice`, `rls-check`,
  `design-compare`) authored. This phase uses `migration` (authoring) and
  `rls-check` (verification).
- **Locked decisions honored (NOTES.md / GAPS.md #29):** Model 1 (directory owns
  stage + `discipler_id`); shared `auth.users`; Agapay objects only in
  `discipleship`; write-back only via RPC.
- The baseline's `members.discipleship_stage` CHECK must match the verified live
  values `('Newbie','Growing','Leader')` — cross-checked in Phase 0's GAPS
  archive. If Phase 0's baseline says anything else, fix the baseline first.

## 3. Work items

Ten ordered migrations, prefix `discipleship_`, **each table carries its RLS in
the same file** (RULES #19). Files live in `supabase/migrations/` (repo root),
named `<timestamp>_discipleship_<name>.sql` so they sort after the Tierra baseline
and the 3 remote migrations. Suggested timestamps below are contiguous; keep the
order, not the exact digits.

Conventions applied to **every** object:
- Primary keys `uuid DEFAULT gen_random_uuid()` (pgcrypto, present on Supabase).
- Every `security definer` function: `SET search_path = pg_catalog, public,
  discipleship`, `REVOKE EXECUTE … FROM public, anon`, `GRANT EXECUTE … TO
  authenticated` (mirrors Tierra advisor fixes 0011/0028 in
  `2026-07-10_production_hardening.sql`).
- Every table: `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` and **explicit** grants
  to `authenticated` (RLS is the gate) + `service_role` (seed/import bypass). No
  grants to `anon` — Agapay requires login.
- `now() AT TIME ZONE 'Asia/Manila'` for every date derivation (RULES #22).

---

### 3.1 — `20260711090000_discipleship_init.sql` (schema, enums, settings)

Schema + least-privilege grants:

```sql
CREATE SCHEMA IF NOT EXISTS discipleship;
REVOKE ALL ON SCHEMA discipleship FROM public;
GRANT USAGE ON SCHEMA discipleship TO authenticated, service_role;
-- default privileges so later-created objects in this schema are usable
ALTER DEFAULT PRIVILEGES IN SCHEMA discipleship
  GRANT ALL ON TABLES TO service_role;
```

Enums (closed sets Agapay owns; `stage` mirrors the *stored* Tierra values so
comparisons to `members.discipleship_stage` are direct — UI maps `Newbie` →
"New Believer" at the boundary, never in SQL):

```sql
CREATE TYPE discipleship.stage          AS ENUM ('Newbie','Growing','Leader');
CREATE TYPE discipleship.app_role       AS ENUM ('admin','discipler');
CREATE TYPE discipleship.activity_type  AS ENUM
  ('one_on_one','life_group','sunday_service','prayer_meeting','note');
CREATE TYPE discipleship.meeting_status AS ENUM
  ('upcoming','completed','cancelled','noshow');
CREATE TYPE discipleship.meeting_mode   AS ENUM ('inperson','online');
CREATE TYPE discipleship.recurrence     AS ENUM ('none','weekly','biweekly');
```

Settings singleton (engagement thresholds — RULES #17, defaults 14/28, must stay
configurable, never hardcoded downstream):

```sql
CREATE TABLE discipleship.settings (
  id               int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  amber_after_days int NOT NULL DEFAULT 14 CHECK (amber_after_days > 0),
  red_after_days   int NOT NULL DEFAULT 28 CHECK (red_after_days > amber_after_days),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
INSERT INTO discipleship.settings (id) VALUES (1);

ALTER TABLE discipleship.settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON discipleship.settings TO authenticated;
GRANT SELECT, UPDATE ON discipleship.settings TO service_role;

CREATE POLICY settings_read_auth  ON discipleship.settings
  FOR SELECT TO authenticated USING (true);
-- admin update policy is added in the profiles migration (needs is_agapay_admin())
```

Shared `updated_at` trigger fn (schema-local, so Tierra's `public.update_updated_at`
is never referenced):

```sql
CREATE FUNCTION discipleship.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
```

---

### 3.2 — `20260711090100_discipleship_profiles.sql` (roles on shared auth + access helpers)

Agapay's own role table keyed to the shared `auth.users` (NOTES #26 — separate
from Tierra's `user_profiles`):

```sql
CREATE TABLE discipleship.profiles (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id  uuid REFERENCES public.members(id) ON DELETE SET NULL,
  role       discipleship.app_role NOT NULL DEFAULT 'discipler',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_disc_profiles_member ON discipleship.profiles(member_id);
CREATE INDEX idx_disc_profiles_role   ON discipleship.profiles(role);
CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON discipleship.profiles
  FOR EACH ROW EXECUTE FUNCTION discipleship.set_updated_at();
```

**Access helpers** — all `security definer` + `stable` so they bypass RLS and
avoid policy recursion (the exact pattern Tierra used for `is_admin()`):

```sql
CREATE FUNCTION discipleship.current_member_id() RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public, discipleship AS $$
  SELECT member_id FROM discipleship.profiles WHERE user_id = auth.uid();
$$;

CREATE FUNCTION discipleship.is_agapay_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public, discipleship AS $$
  SELECT EXISTS (
    SELECT 1 FROM discipleship.profiles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- discipler-of-record test against the directory (member-keyed)
CREATE FUNCTION discipleship.is_discipler_of(target_member uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public, discipleship AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = target_member
      AND m.discipler_id = discipleship.current_member_id()
  );
$$;

REVOKE EXECUTE ON FUNCTION discipleship.current_member_id(),
  discipleship.is_agapay_admin(), discipleship.is_discipler_of(uuid)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION discipleship.current_member_id(),
  discipleship.is_agapay_admin(), discipleship.is_discipler_of(uuid)
  TO authenticated;
```

RLS on `profiles` (own row + admin; writes admin/service only — roles are assigned
at import, no self-signup in v1):

```sql
ALTER TABLE discipleship.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON discipleship.profiles TO authenticated;
GRANT ALL ON discipleship.profiles TO service_role;

CREATE POLICY profiles_read_own   ON discipleship.profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY profiles_read_admin ON discipleship.profiles
  FOR SELECT TO authenticated USING (discipleship.is_agapay_admin());
CREATE POLICY profiles_admin_write ON discipleship.profiles
  FOR ALL TO authenticated
  USING (discipleship.is_agapay_admin())
  WITH CHECK (discipleship.is_agapay_admin());
```

Now that `is_agapay_admin()` exists, add the settings admin-update policy deferred
from 3.1:

```sql
CREATE POLICY settings_update_admin ON discipleship.settings
  FOR UPDATE TO authenticated
  USING (discipleship.is_agapay_admin()) WITH CHECK (discipleship.is_agapay_admin());
```

> **Deliberate non-action (Tierra safety):** Agapay does **not** add an
> `on_auth_user_created` trigger. `discipleship.profiles` rows are created by the
> Phase 6 import / admin action, never by touching Tierra's auth trigger.

---

### 3.3 — `20260711090200_discipleship_disciple_profiles.sql` (enrollment)

```sql
CREATE TABLE discipleship.disciple_profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid NOT NULL UNIQUE REFERENCES public.members(id) ON DELETE CASCADE,
  cohort      text,                 -- Agapay-side ("Q2 2026"); Tierra has none (GAPS #28)
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  enrolled_by uuid REFERENCES public.members(id) ON DELETE SET NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_disc_prof_member ON discipleship.disciple_profiles(member_id);
CREATE INDEX idx_disc_prof_cohort ON discipleship.disciple_profiles(cohort);
CREATE TRIGGER trg_disc_prof_updated BEFORE UPDATE ON discipleship.disciple_profiles
  FOR EACH ROW EXECUTE FUNCTION discipleship.set_updated_at();
```

**Universal child-access predicate** (all behavioral tables key by
`disciple_id`; this one helper scopes them all, `security definer` to bypass RLS
and prevent recursion):

```sql
CREATE FUNCTION discipleship.can_access_disciple(p_disciple uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public, discipleship AS $$
  SELECT discipleship.is_agapay_admin()
      OR EXISTS (
        SELECT 1
        FROM discipleship.disciple_profiles dp
        JOIN public.members m ON m.id = dp.member_id
        WHERE dp.id = p_disciple
          AND m.discipler_id = discipleship.current_member_id()
      );
$$;
REVOKE EXECUTE ON FUNCTION discipleship.can_access_disciple(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION discipleship.can_access_disciple(uuid) TO authenticated;
```

RLS — **the core role-scoping rule (RULES #19):** a discipler sees only rows whose
member's `discipler_id = current_member_id()`; admin sees all. Direct writes are
admin/service only (enrollment happens via `add_disciple`):

```sql
ALTER TABLE discipleship.disciple_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON discipleship.disciple_profiles TO authenticated;
GRANT ALL ON discipleship.disciple_profiles TO service_role;

CREATE POLICY disc_prof_select ON discipleship.disciple_profiles
  FOR SELECT TO authenticated
  USING (discipleship.is_agapay_admin()
         OR discipleship.is_discipler_of(member_id));
CREATE POLICY disc_prof_admin_write ON discipleship.disciple_profiles
  FOR ALL TO authenticated
  USING (discipleship.is_agapay_admin()) WITH CHECK (discipleship.is_agapay_admin());
```

---

### 3.4 — `20260711090300_discipleship_master_checklists.sql` (per-stage master, admin-write)

```sql
CREATE TABLE discipleship.master_checklists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage      discipleship.stage NOT NULL,
  position   int NOT NULL,
  text       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT master_checklists_stage_pos_uq
    UNIQUE (stage, position) DEFERRABLE INITIALLY DEFERRED  -- allows reorder swaps
);
CREATE INDEX idx_master_checklists_stage ON discipleship.master_checklists(stage, position);
CREATE TRIGGER trg_master_updated BEFORE UPDATE ON discipleship.master_checklists
  FOR EACH ROW EXECUTE FUNCTION discipleship.set_updated_at();
```

Seed the default master content **in the migration** (reference/config data, like
Tierra seeds satellites in `schema.sql`; source = `app/src/data/seed.ts`
`MASTER_CHECKLISTS`, NB 6 / Growing 5 / Leader 4):

```sql
INSERT INTO discipleship.master_checklists (stage, position, text) VALUES
  ('Newbie',1,'Water baptism'),
  ('Newbie',2,'Complete One2One sessions (4)'),
  ('Newbie',3,'Attend Sunday service 4 weeks in a row'),
  ('Newbie',4,'Join a Life Group'),
  ('Newbie',5,'Receive first Bible'),
  ('Newbie',6,'Share testimony in Life Group'),
  ('Growing',1,'Complete Victory Weekend'),
  ('Growing',2,'Serve in a ministry'),
  ('Growing',3,'Build a daily devotion habit'),
  ('Growing',4,'Complete doctrine classes'),
  ('Growing',5,'Lead prayer in Life Group'),
  ('Leader',1,'Complete leadership training'),
  ('Leader',2,'Facilitate a Life Group'),
  ('Leader',3,'Begin discipling someone one-on-one'),
  ('Leader',4,'Complete School of Discipleship')
ON CONFLICT ON CONSTRAINT master_checklists_stage_pos_uq DO NOTHING;
```

RLS (all authenticated may read — needed to render the admin editor and is
non-sensitive; only admin writes; RULES #20 — edits must not touch instances,
enforced by the snapshot boundary in 3.5, not by the master table):

```sql
ALTER TABLE discipleship.master_checklists ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON discipleship.master_checklists TO authenticated;
GRANT ALL ON discipleship.master_checklists TO service_role;

CREATE POLICY master_read_auth   ON discipleship.master_checklists
  FOR SELECT TO authenticated USING (true);
CREATE POLICY master_write_admin ON discipleship.master_checklists
  FOR ALL TO authenticated
  USING (discipleship.is_agapay_admin()) WITH CHECK (discipleship.is_agapay_admin());
```

---

### 3.5 — `20260711090400_discipleship_disciple_checklist_items.sql` (instance snapshots + snapshot fn)

```sql
CREATE TABLE discipleship.disciple_checklist_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disciple_id uuid NOT NULL REFERENCES discipleship.disciple_profiles(id) ON DELETE CASCADE,
  stage       discipleship.stage NOT NULL,   -- the stage this snapshot belongs to
  position    int NOT NULL,
  text        text NOT NULL,                 -- copied verbatim at snapshot time
  is_done     boolean NOT NULL DEFAULT false,
  done_at     timestamptz,
  done_by     uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_checklist_items_disciple ON discipleship.disciple_checklist_items(disciple_id);
CREATE TRIGGER trg_checklist_updated BEFORE UPDATE ON discipleship.disciple_checklist_items
  FOR EACH ROW EXECUTE FUNCTION discipleship.set_updated_at();
```

Snapshot function — replaces a disciple's checklist with a fresh copy of a stage's
active master items. Runs **only at stage entry** (enrollment via `add_disciple`,
promotion via `promote_disciple`) so later master edits never mutate in-progress
instances (RULES #20):

```sql
CREATE FUNCTION discipleship.snapshot_checklist(p_disciple uuid, p_stage discipleship.stage)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, discipleship AS $$
BEGIN
  DELETE FROM discipleship.disciple_checklist_items WHERE disciple_id = p_disciple;
  INSERT INTO discipleship.disciple_checklist_items (disciple_id, stage, position, text)
  SELECT p_disciple, mc.stage, mc.position, mc.text
  FROM discipleship.master_checklists mc
  WHERE mc.stage = p_stage AND mc.is_active
  ORDER BY mc.position;
END $$;
REVOKE EXECUTE ON FUNCTION discipleship.snapshot_checklist(uuid, discipleship.stage) FROM public, anon;
-- callers are the RPCs (definer) + service_role; not granted to authenticated directly
GRANT EXECUTE ON FUNCTION discipleship.snapshot_checklist(uuid, discipleship.stage) TO service_role;
```

RLS — read + toggle by discipler-of-record **or** admin (GAPS #20); insert/delete
only via the snapshot fn / admin (disciplers never add or remove checklist items):

```sql
ALTER TABLE discipleship.disciple_checklist_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON discipleship.disciple_checklist_items TO authenticated;
GRANT ALL ON discipleship.disciple_checklist_items TO service_role;

CREATE POLICY checklist_select ON discipleship.disciple_checklist_items
  FOR SELECT TO authenticated USING (discipleship.can_access_disciple(disciple_id));
CREATE POLICY checklist_toggle ON discipleship.disciple_checklist_items
  FOR UPDATE TO authenticated
  USING (discipleship.can_access_disciple(disciple_id))
  WITH CHECK (discipleship.can_access_disciple(disciple_id));
CREATE POLICY checklist_admin_write ON discipleship.disciple_checklist_items
  FOR ALL TO authenticated
  USING (discipleship.is_agapay_admin()) WITH CHECK (discipleship.is_agapay_admin());
```

---

### 3.6 — `20260711090500_discipleship_activity_logs.sql` (append-only timeline)

```sql
CREATE TABLE discipleship.activity_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disciple_id   uuid NOT NULL REFERENCES discipleship.disciple_profiles(id) ON DELETE CASCADE,
  activity_type discipleship.activity_type NOT NULL,
  occurred_on   date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Manila')::date,
  note          text,
  logged_by     uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()   -- no updated_at: append-only
);
CREATE INDEX idx_activity_logs_disciple ON discipleship.activity_logs(disciple_id, occurred_on DESC);
CREATE INDEX idx_activity_logs_logger   ON discipleship.activity_logs(logged_by, created_at DESC);
```

Append-only RLS (RULES #21): **grant only SELECT + INSERT**; declare **no** UPDATE
or DELETE policy, and explicitly `REVOKE UPDATE, DELETE` so append-only holds even
if a future blanket grant is added. Logging is the derived-engagement reset — a new
row is automatically the most recent touch, so no stored `days` field (RULES #18,
GAPS #5):

```sql
ALTER TABLE discipleship.activity_logs ENABLE ROW LEVEL SECURITY;
REVOKE UPDATE, DELETE ON discipleship.activity_logs FROM authenticated;
GRANT SELECT, INSERT ON discipleship.activity_logs TO authenticated;
GRANT ALL ON discipleship.activity_logs TO service_role;

CREATE POLICY activity_select ON discipleship.activity_logs
  FOR SELECT TO authenticated USING (discipleship.can_access_disciple(disciple_id));
CREATE POLICY activity_insert ON discipleship.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    discipleship.can_access_disciple(disciple_id)
    AND (logged_by = discipleship.current_member_id() OR discipleship.is_agapay_admin())
  );
-- no UPDATE / no DELETE policy → both denied for authenticated
```

---

### 3.7 — `20260711090600_discipleship_meetings.sql` (+ completion trigger)

```sql
CREATE TABLE discipleship.meetings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disciple_id   uuid NOT NULL REFERENCES discipleship.disciple_profiles(id) ON DELETE CASCADE,
  scheduled_at  timestamptz NOT NULL,
  duration_min  int NOT NULL DEFAULT 60 CHECK (duration_min > 0),
  mode          discipleship.meeting_mode   NOT NULL DEFAULT 'inperson',
  place         text,
  recurrence    discipleship.recurrence     NOT NULL DEFAULT 'none',  -- materialization deferred (GAPS #8)
  status        discipleship.meeting_status NOT NULL DEFAULT 'upcoming',
  note          text,
  completed_at  timestamptz,
  scheduled_by  uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_meetings_disciple ON discipleship.meetings(disciple_id, scheduled_at DESC);
CREATE INDEX idx_meetings_status   ON discipleship.meetings(status);
CREATE TRIGGER trg_meetings_updated BEFORE UPDATE ON discipleship.meetings
  FOR EACH ROW EXECUTE FUNCTION discipleship.set_updated_at();
```

Completion trigger — stamps `completed_at` when status enters `completed`, clears
it if status leaves. A completed meeting is a derived-engagement reset (its
`completed_at` date feeds `disciple_engagement`); cancel/no-show do **not** reset
(CLAUDE.md key behavior 1, INVENTORY §6):

```sql
CREATE FUNCTION discipleship.stamp_meeting_completion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_meetings_completion
  BEFORE INSERT OR UPDATE ON discipleship.meetings
  FOR EACH ROW EXECUTE FUNCTION discipleship.stamp_meeting_completion();
```

RLS — read/insert/update by discipler-of-record or admin (meetings are mutable:
schedule → complete/cancel/no-show/reschedule); delete admin-only:

```sql
ALTER TABLE discipleship.meetings ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON discipleship.meetings FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON discipleship.meetings TO authenticated;
GRANT ALL ON discipleship.meetings TO service_role;

CREATE POLICY meetings_select ON discipleship.meetings
  FOR SELECT TO authenticated USING (discipleship.can_access_disciple(disciple_id));
CREATE POLICY meetings_insert ON discipleship.meetings
  FOR INSERT TO authenticated
  WITH CHECK (
    discipleship.can_access_disciple(disciple_id)
    AND (scheduled_by = discipleship.current_member_id() OR discipleship.is_agapay_admin())
  );
CREATE POLICY meetings_update ON discipleship.meetings
  FOR UPDATE TO authenticated
  USING (discipleship.can_access_disciple(disciple_id))
  WITH CHECK (discipleship.can_access_disciple(disciple_id));
CREATE POLICY meetings_delete_admin ON discipleship.meetings
  FOR DELETE TO authenticated USING (discipleship.is_agapay_admin());
```

---

### 3.8 — `20260711090700_discipleship_milestones.sql`

```sql
CREATE TABLE discipleship.milestones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disciple_id  uuid NOT NULL REFERENCES discipleship.disciple_profiles(id) ON DELETE CASCADE,
  title        text NOT NULL,
  position     int NOT NULL DEFAULT 0,
  achieved_at  date,                 -- NULL = "Not yet"
  achieved_by  uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_milestones_disciple ON discipleship.milestones(disciple_id, position);
CREATE TRIGGER trg_milestones_updated BEFORE UPDATE ON discipleship.milestones
  FOR EACH ROW EXECUTE FUNCTION discipleship.set_updated_at();
```

Default set (Salvation decision, First Life Group, Water baptism, First serve) is
seeded per disciple by `add_disciple` / the seed, not here (GAPS #7 — the
achieve/edit UI is deferred to a feature phase). RLS mirrors meetings: read + mark
achieved by discipler-of-record or admin; insert/delete admin-only:

```sql
ALTER TABLE discipleship.milestones ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON discipleship.milestones TO authenticated;
GRANT ALL ON discipleship.milestones TO service_role;

CREATE POLICY milestones_select ON discipleship.milestones
  FOR SELECT TO authenticated USING (discipleship.can_access_disciple(disciple_id));
CREATE POLICY milestones_update ON discipleship.milestones
  FOR UPDATE TO authenticated
  USING (discipleship.can_access_disciple(disciple_id))
  WITH CHECK (discipleship.can_access_disciple(disciple_id));
CREATE POLICY milestones_admin_write ON discipleship.milestones
  FOR ALL TO authenticated
  USING (discipleship.is_agapay_admin()) WITH CHECK (discipleship.is_agapay_admin());
```

---

### 3.9 — `20260711090800_discipleship_rpcs.sql` (stage_transitions audit + the 3 write-back RPCs)

**`stage_transitions`** is created here — it is the append-only audit backbone the
RPCs (and the `stage_trend` view) depend on; it is not its own numbered migration
in ROADMAP but belongs with its only writers. Its note is required (leadership
audit, CLAUDE.md key behavior 2); enrollment rows use `from_stage = NULL`
("Joined Agapay", GAPS #10):

```sql
CREATE TABLE discipleship.stage_transitions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disciple_id     uuid NOT NULL REFERENCES discipleship.disciple_profiles(id) ON DELETE CASCADE,
  from_stage      discipleship.stage,          -- NULL = enrollment
  to_stage        discipleship.stage NOT NULL,
  note            text NOT NULL,
  transitioned_by uuid REFERENCES public.members(id) ON DELETE SET NULL,
  transitioned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stage_trans_disciple ON discipleship.stage_transitions(disciple_id, transitioned_at DESC);
CREATE INDEX idx_stage_trans_at       ON discipleship.stage_transitions(transitioned_at);

ALTER TABLE discipleship.stage_transitions ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON discipleship.stage_transitions FROM authenticated;  -- written only by definer RPCs
GRANT SELECT ON discipleship.stage_transitions TO authenticated;
GRANT ALL ON discipleship.stage_transitions TO service_role;

CREATE POLICY stage_trans_select ON discipleship.stage_transitions
  FOR SELECT TO authenticated USING (discipleship.can_access_disciple(disciple_id));
-- no write policy: authenticated cannot INSERT/UPDATE/DELETE; the SECURITY DEFINER RPCs do
```

> **Why the RPCs are the security boundary:** each RPC is `SECURITY DEFINER` owned
> by the migration role (`postgres`, which has `BYPASSRLS`). Inside the function
> RLS is *off*, so the explicit `is_agapay_admin()` / `can_access_disciple()` /
> note checks below **are** the authorization — they must run *before* any
> mutation. Each RPC touches Tierra only via the two allowed columns / the allowed
> minimal insert.

**`promote_disciple`** — note required, rejects Leader, advances the directory
stage, records the audit row, re-snapshots the checklist (CLAUDE.md key behavior 2):

```sql
CREATE FUNCTION discipleship.promote_disciple(p_disciple uuid, p_note text)
RETURNS TABLE (member_id uuid, from_stage text, to_stage text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, discipleship AS $$
DECLARE v_member uuid; v_cur discipleship.stage; v_next discipleship.stage;
BEGIN
  IF p_note IS NULL OR btrim(p_note) = '' THEN
    RAISE EXCEPTION 'A promotion note is required' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT discipleship.can_access_disciple(p_disciple) THEN
    RAISE EXCEPTION 'Not authorized to promote this disciple' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT dp.member_id, m.discipleship_stage::discipleship.stage
    INTO v_member, v_cur
  FROM discipleship.disciple_profiles dp
  JOIN public.members m ON m.id = dp.member_id
  WHERE dp.id = p_disciple;
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'Disciple not found' USING ERRCODE = 'no_data_found';
  END IF;

  v_next := CASE v_cur
              WHEN 'Newbie'  THEN 'Growing'
              WHEN 'Growing' THEN 'Leader'
              ELSE NULL END;
  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Leaders cannot be promoted further' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.members SET discipleship_stage = v_next::text WHERE id = v_member;  -- allowed Tierra write #1
  INSERT INTO discipleship.stage_transitions (disciple_id, from_stage, to_stage, note, transitioned_by)
  VALUES (p_disciple, v_cur, v_next, btrim(p_note), discipleship.current_member_id());
  PERFORM discipleship.snapshot_checklist(p_disciple, v_next);

  RETURN QUERY SELECT v_member, v_cur::text, v_next::text;
END $$;
```

**`reassign_disciples`** — admin-only bulk move; rewrites `members.discipler_id`
for each selected disciple (CLAUDE.md key behavior 6). Accepts
`disciple_profiles.id[]`:

```sql
CREATE FUNCTION discipleship.reassign_disciples(p_disciple_ids uuid[], p_to_member uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, discipleship AS $$
DECLARE v_count int;
BEGIN
  IF NOT discipleship.is_agapay_admin() THEN
    RAISE EXCEPTION 'Only admins can reassign disciples' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_to_member AND NOT is_archived) THEN
    RAISE EXCEPTION 'Target discipler is not a valid member' USING ERRCODE = 'foreign_key_violation';
  END IF;

  UPDATE public.members SET discipler_id = p_to_member   -- allowed Tierra write #2
  WHERE id IN (
    SELECT dp.member_id FROM discipleship.disciple_profiles dp
    WHERE dp.id = ANY (p_disciple_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
```

**`add_disciple`** — minimal directory insert for a brand-new believer + enrollment
+ checklist snapshot + default milestones + "Joined Agapay" transition. A discipler
may add for themselves; admin for anyone (GAPS #14). Satisfies `members` NOT NULLs
(`name`, `city`, `discipleship_stage`) by defaulting `city` to the discipler's:

```sql
CREATE FUNCTION discipleship.add_disciple(
  p_name      text,
  p_discipler uuid DEFAULT NULL,
  p_cohort    text DEFAULT NULL,
  p_stage     text DEFAULT 'Newbie',
  p_city      text DEFAULT NULL,
  p_satellite uuid DEFAULT NULL
)
RETURNS TABLE (disciple_id uuid, member_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, discipleship AS $$
DECLARE v_discipler uuid; v_member uuid; v_disciple uuid; v_stage discipleship.stage; v_city text;
BEGIN
  v_discipler := COALESCE(p_discipler, discipleship.current_member_id());
  IF v_discipler IS NULL THEN
    RAISE EXCEPTION 'No discipler context' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_discipler <> discipleship.current_member_id() AND NOT discipleship.is_agapay_admin() THEN
    RAISE EXCEPTION 'Cannot add a disciple for another discipler' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_stage := p_stage::discipleship.stage;  -- validates against ('Newbie','Growing','Leader')
  v_city  := COALESCE(p_city, (SELECT city FROM public.members WHERE id = v_discipler), 'Laguna');

  INSERT INTO public.members (name, city, discipleship_stage, discipler_id, satellite_id,
                              membership_status, joined_date)         -- allowed minimal insert
  VALUES (p_name, v_city, v_stage::text, v_discipler, p_satellite,
          'active', (now() AT TIME ZONE 'Asia/Manila')::date)
  RETURNING id INTO v_member;

  INSERT INTO discipleship.disciple_profiles (member_id, cohort, enrolled_by)
  VALUES (v_member, p_cohort, discipleship.current_member_id())
  RETURNING id INTO v_disciple;

  PERFORM discipleship.snapshot_checklist(v_disciple, v_stage);

  INSERT INTO discipleship.milestones (disciple_id, title, position) VALUES
    (v_disciple,'Salvation decision',1),(v_disciple,'First Life Group',2),
    (v_disciple,'Water baptism',3),(v_disciple,'First serve',4);

  INSERT INTO discipleship.stage_transitions (disciple_id, from_stage, to_stage, note, transitioned_by)
  VALUES (v_disciple, NULL, v_stage, 'Joined Agapay', discipleship.current_member_id());

  RETURN QUERY SELECT v_disciple, v_member;
END $$;
```

Grants for all three RPCs:

```sql
REVOKE EXECUTE ON FUNCTION
  discipleship.promote_disciple(uuid,text),
  discipleship.reassign_disciples(uuid[],uuid),
  discipleship.add_disciple(text,uuid,text,text,text,uuid)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION
  discipleship.promote_disciple(uuid,text),
  discipleship.reassign_disciples(uuid[],uuid),
  discipleship.add_disciple(text,uuid,text,text,text,uuid)
  TO authenticated;
```

---

### 3.10 — `20260711090900_discipleship_views.sql` (derived read models)

**All three views MUST be `WITH (security_invoker = true)`** (Postgres 15+, which
Supabase runs). Without it a view runs as its owner and bypasses RLS — a discipler
querying `disciple_engagement` would see *every* disciple. `security_invoker`
makes the underlying `disciple_profiles` / `members` RLS apply to the *caller*.
This is the single most important line in the phase.

**`disciple_engagement`** — replaces the prototype's stored `days` (RULES #18):
days since last activity **or** completed meeting → `healthy`/`cooling`/`at_risk`
read live from `settings`:

```sql
CREATE VIEW discipleship.disciple_engagement WITH (security_invoker = true) AS
SELECT
  dp.id AS disciple_id, dp.member_id, m.name,
  m.discipleship_stage AS stage,          -- 'Newbie'|'Growing'|'Leader' (UI maps Newbie→New Believer)
  m.discipler_id, dp.cohort, lt.last_touch,
  CASE WHEN lt.last_touch IS NULL THEN NULL
       ELSE ((now() AT TIME ZONE 'Asia/Manila')::date - lt.last_touch) END AS days_since,
  CASE
    WHEN lt.last_touch IS NULL THEN 'at_risk'
    WHEN ((now() AT TIME ZONE 'Asia/Manila')::date - lt.last_touch) > s.red_after_days   THEN 'at_risk'
    WHEN ((now() AT TIME ZONE 'Asia/Manila')::date - lt.last_touch) > s.amber_after_days THEN 'cooling'
    ELSE 'healthy'
  END AS engagement
FROM discipleship.disciple_profiles dp
JOIN public.members m ON m.id = dp.member_id
CROSS JOIN discipleship.settings s
LEFT JOIN LATERAL (
  SELECT GREATEST(
    (SELECT max(al.occurred_on) FROM discipleship.activity_logs al WHERE al.disciple_id = dp.id),
    (SELECT max((mt.completed_at AT TIME ZONE 'Asia/Manila')::date)
       FROM discipleship.meetings mt WHERE mt.disciple_id = dp.id AND mt.status = 'completed')
  ) AS last_touch
) lt ON true
WHERE NOT dp.is_archived;
```

**`discipler_load`** — per-discipler counts + Inactive flag (CLAUDE.md key
behavior 5: a discipler whose own last log exceeds the amber threshold is
Inactive; NOTES: Josie 18d → Inactive). "Own last log" = most recent
`activity_logs` row **they** created (`logged_by = discipler.member_id`):

```sql
CREATE VIEW discipleship.discipler_load WITH (security_invoker = true) AS
WITH loads AS (
  SELECT m.discipler_id AS discipler_member_id,
         count(*)                                               AS disciple_count,
         count(*) FILTER (WHERE e.engagement = 'at_risk')       AS at_risk_count,
         count(*) FILTER (WHERE e.engagement IN ('at_risk','cooling')) AS needs_attention_count
  FROM discipleship.disciple_profiles dp
  JOIN public.members m ON m.id = dp.member_id
  JOIN discipleship.disciple_engagement e ON e.disciple_id = dp.id
  WHERE m.discipler_id IS NOT NULL AND NOT dp.is_archived
  GROUP BY m.discipler_id
)
SELECT d.id AS discipler_member_id, d.name AS discipler_name,
       COALESCE(l.disciple_count,0)          AS disciple_count,
       COALESCE(l.at_risk_count,0)           AS at_risk_count,
       COALESCE(l.needs_attention_count,0)   AS needs_attention_count,
       ll.last_log,
       CASE WHEN ll.last_log IS NULL THEN true
            WHEN ((now() AT TIME ZONE 'Asia/Manila')::date - ll.last_log) > s.amber_after_days THEN true
            ELSE false END AS is_inactive
FROM loads l
JOIN public.members d ON d.id = l.discipler_member_id
CROSS JOIN discipleship.settings s
LEFT JOIN LATERAL (
  SELECT max((al.created_at AT TIME ZONE 'Asia/Manila')::date) AS last_log
  FROM discipleship.activity_logs al WHERE al.logged_by = d.id
) ll ON true;
```

**`stage_trend`** — monthly disciples-per-stage from `stage_transitions` (replaces
`STAGE_TREND_HISTORY`; feeds the Phase 5 growth chart). Each month a disciple is
counted in the stage of their latest transition on/before that month's end:

```sql
CREATE VIEW discipleship.stage_trend WITH (security_invoker = true) AS
WITH months AS (
  SELECT date_trunc('month', gs)::date AS month_start
  FROM generate_series(
    COALESCE(date_trunc('month', (SELECT min(transitioned_at) FROM discipleship.stage_transitions)),
             date_trunc('month', now())),
    date_trunc('month', now()), interval '1 month') gs
),
snap AS (
  SELECT mo.month_start, dp.id AS disciple_id,
         (SELECT st.to_stage FROM discipleship.stage_transitions st
          WHERE st.disciple_id = dp.id
            AND st.transitioned_at < (mo.month_start + interval '1 month')
          ORDER BY st.transitioned_at DESC LIMIT 1) AS stage_at_month
  FROM months mo CROSS JOIN discipleship.disciple_profiles dp
)
SELECT month_start, stage_at_month AS stage, count(*) AS disciple_count
FROM snap WHERE stage_at_month IS NOT NULL
GROUP BY month_start, stage_at_month
ORDER BY month_start, stage;

GRANT SELECT ON discipleship.disciple_engagement,
               discipleship.discipler_load,
               discipleship.stage_trend TO authenticated;
```

---

### 3.11 — Local seed: `supabase/seed.sql`

Runs after migrations on every `supabase db reset`, as `postgres`/`service_role`
(bypasses RLS). Reproduces the prototype dataset from `app/src/data/seed.ts` so
Phase 3 screens match the prototype shape exactly:

1. **Auth users** (local GoTrue) for the 4 disciplers + admin, deterministic UUIDs,
   password `agapay-dev` (dev only): `alma@questlaguna.org`,
   `josie@questlaguna.org`, `gina@…`, `rodel@…`, `danilo@…` (admin). Insert into
   `auth.users` + `auth.identities` (or use `supabase.auth.admin` in a companion
   script; document whichever Phase 0's `rls-check` skill standardizes).
2. **Members**: the 4 disciplers + 43 disciples. `discipleship_stage` written in
   **Tierra vocab** — map seed stage → column: `New Believer → 'Newbie'`,
   `Growing → 'Growing'`, `Leader → 'Leader'`. Only `s14` Jules Gerardo Alba is
   `New Believer → 'Newbie'` (the boundary-mapping test fixture). Set `discipler_id`
   to the discipler's member id; `city` real, `is_archived = false`.
3. **`discipleship.profiles`**: one row per discipler (`role='discipler'`,
   `member_id`), plus Ptr. Danilo (`role='admin'`). Gina & Rodel get
   `discipler` profiles **and** appear as disciples under TRIBES (multiplication).
4. **`disciple_profiles`**: enrollment per disciple with cohort.
5. **`disciple_checklist_items`**: call `snapshot_checklist(disciple, stage)` then
   mark `chkDone` items `is_done=true` to reproduce checklist %.
6. **`activity_logs`**: for each disciple insert one row with
   `occurred_on = today − days` (Asia/Manila) and `logged_by` = the discipler, so
   `disciple_engagement.days_since` reproduces the seed `days` (queue shape). For
   the **discipler-inactive** fixtures, control each discipler's own newest
   `logged_by` date: Alma 0d (log today), Josie 18d (→ Inactive), Gina 3d,
   Rodel 9d.
7. **`meetings`**: the 8 prototype meetings incl. Marilou's 2 `noshow` rows (must
   **not** reset engagement) and 2 `completed` rows.
8. **`milestones`**: default 4 per disciple; mark `achieved_at` per seed
   `milestones` count.
9. **`stage_transitions`**: one `from_stage=NULL` "Joined Agapay" row per disciple
   ~160d ago, plus a spread of promotion rows across Feb–Jul so `stage_trend`
   yields a non-trivial chart.

---

### 3.12 — Client contract surface (created this phase, consumed later)

- `supabase gen types typescript --local --schema public,discipleship >
  app/src/lib/supabase/database.types.ts` — generated types; must compile under
  `pnpm exec tsc --noEmit` (exit-gate). New folder `app/src/lib/supabase/`.
- Extend `app/src/lib/stages.ts` with the boundary mapping (single source, RULES
  boundary rule):

  ```ts
  export type DbStage = 'Newbie' | 'Growing' | 'Leader'
  const DB_TO_UI: Record<DbStage, Stage> = {
    Newbie: 'New Believer', Growing: 'Growing', Leader: 'Leader',
  }
  export function dbStageToUi(s: DbStage): Stage { return DB_TO_UI[s] }
  export function uiStageToDb(s: Stage): DbStage {
    return s === 'New Believer' ? 'Newbie' : s
  }
  ```
- New `app/src/lib/activity-types.ts` — map DB enum ↔ UI labels
  (`one_on_one`↔`One-on-one`, `life_group`↔`Life Group`,
  `sunday_service`↔`Sunday Service`, `prayer_meeting`↔`Prayer Meeting`,
  `note`↔`Note`).
- No TanStack Query wiring, no `queryKeys.ts`, no Supabase client instantiation in
  this phase — that is Phase 2/3. This phase ships only the schema, the generated
  types, and the two pure mapping modules (+ their unit tests).

## 4. Interfaces & contracts

**Postgres enums** — `discipleship.{stage, app_role, activity_type,
meeting_status, meeting_mode, recurrence}` (values in 3.1). `stage` uses the
*stored* Tierra vocab; UI translation is client-side only.

**Access helpers** (SECURITY DEFINER, EXECUTE→authenticated only):
- `discipleship.current_member_id() → uuid`
- `discipleship.is_agapay_admin() → boolean`
- `discipleship.is_discipler_of(target_member uuid) → boolean`
- `discipleship.can_access_disciple(p_disciple uuid) → boolean`
- `discipleship.snapshot_checklist(p_disciple uuid, p_stage discipleship.stage) → void` (service_role only)

**RPCs** (SECURITY DEFINER, EXECUTE→authenticated; PostgREST path `rpc/<name>`):
- `promote_disciple(p_disciple uuid, p_note text) → TABLE(member_id uuid, from_stage text, to_stage text)`.
  Errors: `check_violation` "A promotion note is required" / "Leaders cannot be
  promoted further"; `insufficient_privilege` "Not authorized…".
- `reassign_disciples(p_disciple_ids uuid[], p_to_member uuid) → integer` (rows
  updated). Error `insufficient_privilege` "Only admins can reassign disciples".
- `add_disciple(p_name text, p_discipler uuid=NULL, p_cohort text=NULL,
  p_stage text='Newbie', p_city text=NULL, p_satellite uuid=NULL) →
  TABLE(disciple_id uuid, member_id uuid)`.

**Views** (all `security_invoker=true`, SELECT→authenticated):
- `disciple_engagement(disciple_id, member_id, name, stage, discipler_id, cohort,
  last_touch date, days_since int, engagement text ∈ {healthy,cooling,at_risk})`
- `discipler_load(discipler_member_id, discipler_name, disciple_count,
  at_risk_count, needs_attention_count, last_log date, is_inactive boolean)`
- `stage_trend(month_start date, stage text, disciple_count int)`

**Envelope shape:** at the PostgREST boundary supabase-js returns
`{ data, error: PostgrestError }` — Phase 1 does not add the app's `ApiResponse`
envelope. The three RPC error messages above are the contract the Phase-4 UI
translates into warm copy (note-required, leader-reject, admin-only). `engagement`
= `at_risk` maps to UI "At-risk", `cooling`→"Cooling", `healthy`→"Healthy";
`stage` "Newbie"→"New Believer" via `dbStageToUi`.

**Query-key note (forward contract, not built here):** Phase 3
`app/src/features/<feature>/queryKeys.ts` will key on these views/tables
(`['engagement', memberId]`, `['disciples', disciplerId]`, …). Listed so the data
layer's shape is designed for it; no code in Phase 1.

## 5. Test plan

Runner: **pgTAP** via `supabase test db` (files in `supabase/tests/database/`),
the mechanism the Phase-0 `rls-check` skill standardizes. Each RLS scenario sets
the caller with `SET LOCAL ROLE authenticated;` +
`SELECT set_config('request.jwt.claims', json_build_object('sub', '<auth-uuid>',
'role','authenticated')::text, true);` then asserts with `results_eq` / `is_empty`
/ `throws_ok`. Seed UUIDs are fixed in `seed.sql` so tests reference them by
constant.

**RLS / role-scoping** (`rls_disciple_scoping.sql`):
| # | Caller | Query | Expect |
|---|--------|-------|--------|
| R1 | Alma (discipler) | `SELECT count(*) FROM discipleship.disciple_profiles` | 11 (her TRIBES disciples d1–d11) — **not** 43 |
| R2 | Alma | `SELECT … WHERE id = <d12 (Josie's)>` | **0 rows** (deny) |
| R3 | Alma | `SELECT * FROM discipleship.activity_logs WHERE disciple_id=<d12>` | **0 rows** |
| R4 | Alma | `SELECT * FROM discipleship.meetings WHERE disciple_id=<d12>` | **0 rows** |
| R5 | Alma | `SELECT disciple_id,days_since,engagement FROM discipleship.disciple_engagement` | only d1–d11; d1 `at_risk` (34d), values match seed |
| R6 | Josie | `SELECT * FROM discipleship.disciple_engagement WHERE disciple_id=<d1 (Alma's)>` | **0 rows** (cross-discipler deny) |
| R7 | anon (no JWT) | `SELECT * FROM discipleship.disciple_profiles` | **permission denied** (no schema grant) |
| R8 | Ptr. Danilo (admin) | `SELECT count(*) FROM discipleship.disciple_profiles` | **43** (admin sees all) |

**Tierra-safety / Model 1** (`tierra_safety.sql`):
| # | Caller | Action | Expect |
|---|--------|--------|--------|
| T1 | Alma | `UPDATE public.members SET discipler_id=<x> WHERE id=<d5's member>` | **0 rows / denied** — discipler cannot rewrite the directory directly |
| T2 | Alma | `UPDATE public.members SET discipleship_stage='Leader' WHERE id=<d3's member>` | **0 rows / denied** |
| T3 | Alma | `SELECT discipleship.reassign_disciples(ARRAY[<d5>], <josie>)` | `throws_ok` "Only admins can reassign disciples" |
| T4 | — | after full suite, assert no non-`discipleship_stage`/`discipler_id` column of `members` changed and no other `public.*` table row changed (snapshot compare) | pass |

**RPC behavior** (`rpc_promote.sql`, `rpc_reassign.sql`, `rpc_add.sql`):
| # | Caller | Call | Expect |
|---|--------|------|--------|
| P1 | Alma | `promote_disciple(<d3 Growing>, '')` | `throws_ok` "A promotion note is required" |
| P2 | Alma | `promote_disciple(<d1 Leader>, 'ready')` | `throws_ok` "Leaders cannot be promoted further" |
| P3 | Alma | `promote_disciple(<d3 Growing>, 'Leading prayer well')` | returns `to_stage='Leader'`; `members.discipleship_stage`='Leader'; one new `stage_transitions` row; checklist re-snapshotted to Leader (4 items, all `is_done=false`) |
| P4 | Alma | `promote_disciple(<d12 Josie's>, 'x')` | `throws_ok` "Not authorized…" |
| P5 | Ptr. Danilo | `reassign_disciples(ARRAY[<d5>,<d6>], <josie>)` | returns 2; both members' `discipler_id`=Josie; now visible to Josie, gone from Alma |
| P6 | Alma | `add_disciple('Test NB')` | inserts a `members` row (`discipleship_stage='Newbie'`, `discipler_id`=Alma), a `disciple_profiles`, 6 checklist items, 4 milestones, one `from_stage=NULL` transition |
| P7 | Alma | `add_disciple('X', p_discipler=<josie>)` | `throws_ok` "Cannot add a disciple for another discipler" |

**Append-only** (`append_only.sql`):
| # | Caller | Action | Expect |
|---|--------|--------|--------|
| A1 | Alma | `INSERT activity_logs (own disciple, logged_by=Alma)` | **allow** |
| A2 | Alma | `INSERT activity_logs (Josie's disciple)` | **deny** (can_access_disciple false) |
| A3 | Alma | `UPDATE`/`DELETE` any `activity_logs` row | **deny** (no policy + revoked grant) |
| A4 | Alma | `UPDATE`/`DELETE` any `stage_transitions` row | **deny** |

**Trigger / derivation** (`triggers.sql`):
| # | Action | Expect |
|---|--------|--------|
| G1 | `UPDATE meetings SET status='completed'` | `completed_at` stamped (was NULL); that disciple's `disciple_engagement.days_since` resets toward 0 |
| G2 | `UPDATE meetings SET status='noshow'` | `completed_at` stays NULL; `days_since` **unchanged** |
| G3 | edit a `master_checklists` row | existing `disciple_checklist_items` **unchanged** (RULES #20) |

**Stage boundary** (`stage_boundary.sql` + client `app/src/lib/stages.test.ts`
under vitest): assert `s14`'s member stores `'Newbie'` and `dbStageToUi('Newbie')
= 'New Believer'`, `uiStageToDb('New Believer') = 'Newbie'`, round-trips for all
three; assert no `members` row anywhere stores `'New Believer'` or `'New Friends'`.

**Type check:** `supabase gen types … --schema public,discipleship` output +
`pnpm exec tsc --noEmit && pnpm lint` green.

## 6. Exit gate

**Single testable condition:** on a clean `supabase db reset` (Tierra baseline +
all 10 discipleship migrations + `seed.sql` apply without error), `supabase test
db` reports **all** pgTAP scenarios green — in particular R1/R2 (Alma cannot read
Josie's disciples/logs/meetings), T1/T3 (a discipler cannot directly UPDATE
`public.members` nor call `reassign_disciples`), P1 (promote without a note is
rejected server-side), P2 (a Leader cannot be promoted), and T4 (no Tierra object
changed except the two allowed `members` columns) — **and** `supabase gen types
--schema public,discipleship` compiles under `pnpm exec tsc --noEmit`. Until this
passes, Phase 2 does not start.

## 7. Risks & mitigations

- **Tierra-safety prime directive.** *Risk:* an RPC or policy mutates a Tierra
  object beyond the two allowed columns / the minimal insert. *Mitigation:* the
  only Tierra writes in the whole phase are the three lines
  `UPDATE members SET discipleship_stage=…`, `UPDATE members SET discipler_id=…`,
  and the `add_disciple` minimal `INSERT`; scenario **T4** snapshots `public` and
  asserts nothing else changed; migrations create objects only in `discipleship`
  and never `ALTER`/`DROP`/`CREATE POLICY` on any `public` table.
- **View RLS leak.** *Risk:* a view without `security_invoker` runs as owner and
  exposes all disciples to a discipler. *Mitigation:* every view is
  `WITH (security_invoker = true)`; scenario **R5/R6** proves Alma's
  `disciple_engagement` excludes Josie's rows.
- **RLS policy recursion / self-reference.** *Mitigation:* all access decisions go
  through `SECURITY DEFINER` helpers (`is_agapay_admin`, `is_discipler_of`,
  `can_access_disciple`) that bypass RLS — the exact pattern Tierra used to fix its
  own `user_profiles` recursion (`fix-public-rls.sql`).
- **SECURITY DEFINER hardening.** *Risk:* `search_path` hijack or anon execution
  (Supabase advisors 0011/0028). *Mitigation:* every definer fn pins
  `search_path = pg_catalog, public, discipleship` and `REVOKE EXECUTE … FROM
  public, anon` — matching `2026-07-10_production_hardening.sql` §3e/3f. Run
  `get_advisors` before any Phase-6 push.
- **Stage-label drift.** *Risk:* enum/boundary built against the wrong vocab.
  *Mitigation:* live CHECK verified = `('Newbie','Growing','Leader')`; enum mirrors
  it; UI-only mapping; scenario `stage_boundary.sql` guards it.
- **Append-only erosion.** *Mitigation:* `activity_logs` / `stage_transitions`
  grant only SELECT(+INSERT) and declare no UPDATE/DELETE policy; **A3/A4** prove it.
- **Accidental prod execution.** *Risk:* a migration runs against
  `ncijotdkovijkcpqnlbv`. *Mitigation:* Phase 1 is **local-only** — never
  `apply_migration`/`db push` here; the baseline is `migration repair`-marked;
  production cutover is Phase 6 (branch → verify → merge).
- **Reorder vs unique constraint.** *Mitigation:* `master_checklists (stage,
  position)` unique is `DEFERRABLE INITIALLY DEFERRED` so Phase-4 reorder swaps
  commit atomically.
- **`gen_random_uuid()` availability.** *Mitigation:* pgcrypto ships on Supabase;
  if a local image lacks it, `CREATE EXTENSION IF NOT EXISTS pgcrypto;` in
  `discipleship_init` (or fall back to Tierra's `uuid-ossp` `uuid_generate_v4()`).

## 8. Rollback / safety

- **Fully additive & isolated.** Everything lives in schema `discipleship`; a
  complete rollback is `DROP SCHEMA discipleship CASCADE;` which leaves Tierra
  (`public`) byte-for-byte unchanged. No Tierra table, policy, trigger, or grant is
  altered by any migration.
- **Local-only blast radius.** Nothing is pushed to the shared project in this
  phase, so production state is unaffected regardless of mistakes. A bad migration
  is fixed by editing the file and re-running `supabase db reset` (local has no
  data to lose).
- **Runtime write-backs are reversible by design.** The only production-directory
  effects (once Phase 6 ships) are stage/`discipler_id` changes; both are columns
  Tierra already owns and edits, and Agapay corrections are new append-only
  `stage_transitions` / re-`reassign` calls, never destructive edits.
- **Directory continuity.** Because reads go through the existing `members_read_auth`
  policy and Agapay adds no policy to Tierra tables, disabling the Agapay app at any
  time restores the status quo instantly (ROADMAP Phase 6 rollback).
