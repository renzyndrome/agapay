# Phase 4 — Write path (mutations)

> Elaborates ROADMAP.md → "Phase 4 — Write path: mutations (2–3 days)".
> Read alongside CLAUDE.md (domain vocab + key behaviors), RULES.md (#13–#22 bind
> this phase), NOTES.md (locked decisions), design/GAPS.md (#5–#21 write-path gaps).
>
> **Prime directive (all phases):** never modify Tierra's schema, policies, or data
> except `public.members.discipleship_stage` and `public.members.discipler_id` via the
> `security definer` RPCs, plus minimal-member inserts for brand-new believers. Every
> Agapay write that is *not* one of those two columns targets the `discipleship` schema.
> Model 1 is locked: the directory (`public.members`) owns identity, stage, and
> discipler assignment; everything behavioral lives in `discipleship`.

---

## 1. Objective

After this phase, every mutating interaction the prototype fakes in `app/src/store.tsx`
persists to Supabase and round-trips: logging an activity, scheduling/completing/
cancelling/no-showing a meeting, toggling a checklist item, promoting a disciple,
bulk-reassigning disciples, and editing the admin master checklist. Writes go through
RLS-scoped inserts/updates in the `discipleship` schema and three `security definer`
RPCs for the two Tierra columns; the UI updates optimistically and reconciles by
invalidating the Phase 3 read queries. No engagement/queue/`%` value is ever written
(all stay derived, RULES #18); the timeline stays append-only (RULES #21).

## 2. Prerequisites

| Needs | From | What it provides this phase |
|---|---|---|
| Local stack + Tierra baseline | Phase 0 | `supabase db reset` yields `public.members` etc.; `supabase/migrations/` exists |
| `discipleship` schema, enums, `settings`, RLS, helpers, RPCs, snapshot fn, `stage_transitions`, views, seed | Phase 1 | Every table + write RLS policy + `promote_disciple` / `reassign_disciples` / `add_disciple` + `current_member_id()` / `is_agapay_admin()` + meeting-completion trigger + seeded auth users (Alma, Josie, Gina, Rodel, Ptr. Danilo) |
| Real login + `current_member_id()` resolution + role redirect + route guards | Phase 2 | Authenticated session so `auth.uid()` → discipler/admin `member_id` |
| TanStack Query client, `supabase-js` client, per-feature `queryKeys.ts`, read hooks (queue, disciples, profile timeline, meetings, admin aggregates), demo-mode fallback | Phase 3 | The query keys this phase invalidates and the cache shapes optimistic updates patch |

Hard blockers if absent: without Phase 1's RPCs and write RLS there is nothing to call;
without Phase 3's query keys there is nothing to invalidate. **Do not begin Phase 4
until Phase 3's exit gate passed.**

**Before writing any mutation, verify the live stage CHECK constraint** (GAPS #27/#32):
repo schema says `('Newbie','Growing','Leader')`, live UI shows *New Friends / Schooling*.
Run MCP `list_tables` / `execute_sql` against `public.members` and archive the actual
`discipleship_stage` check values in `design/GAPS.md`. The boundary mapping
(`app/src/lib/stageMap.ts`) and the `promote_disciple` RPC must write whichever values
production actually stores — never the literal string `'New Believer'`.

---

## 3. Work items (ordered)

### 3.0 — DB write contracts: verify, then add the one net-new object

Phase 1 already created the tables, write RLS, the completion trigger, and the three
member-writing RPCs. Phase 4 **does not redefine them** (policies/triggers are not
`CREATE OR REPLACE`-safe and re-dropping them would fight Phase 1's migration). Instead:

1. **Audit** that the Phase 1 contracts in §3.0.A exist exactly as written (`\d+`,
   `pg_policies`, `\df discipleship.*`). If any is missing, the fix is a small additive
   migration, not an edit to a Phase 1 file.
2. **Add** the single genuinely write-only object Phase 1's read focus did not need:
   an atomic master-checklist **reorder** RPC (§3.0.B). Everything else in this phase is
   client wiring over already-shipped policies/RPCs.

New migration (create with the migration skill so the timestamp is monotonic):

```
supabase/migrations/<TIMESTAMP>_discipleship_write_path.sql
```

#### 3.0.A — Contract owned by Phase 1 (verify only; reproduced here as the spec the client relies on)

Enums (Phase 1 `discipleship_init` / `_activity_logs` / `_meetings`):

```sql
-- discipleship.stage_label: Agapay-side vocabulary (UI truth); mapped to Tierra at the boundary
CREATE TYPE discipleship.stage_label AS ENUM ('New Believer','Growing','Leader');
CREATE TYPE discipleship.activity_type AS ENUM
  ('one_on_one','life_group','sunday_service','prayer_meeting','note');
CREATE TYPE discipleship.meeting_mode   AS ENUM ('inperson','online');
CREATE TYPE discipleship.meeting_status AS ENUM ('upcoming','completed','cancelled','noshow');
CREATE TYPE discipleship.recurrence     AS ENUM ('none','weekly','biweekly');
```

Append-only activity log (INSERT for discipler-of-record + admin; **no UPDATE/DELETE
policy at all** → append-only falls out, RULES #21 / GAPS #11):

```sql
CREATE TABLE discipleship.activity_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  logged_by    uuid NOT NULL REFERENCES public.members(id),   -- = current_member_id()
  type         discipleship.activity_type NOT NULL DEFAULT 'one_on_one',
  occurred_on  date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Manila')::date,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE discipleship.activity_logs ENABLE ROW LEVEL SECURITY;

-- INSERT: only for a disciple you are the discipler-of-record for, or admin.
CREATE POLICY activity_logs_insert ON discipleship.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    logged_by = discipleship.current_member_id()
    AND (
      discipleship.is_agapay_admin()
      OR EXISTS (SELECT 1 FROM public.members m
                 WHERE m.id = member_id
                   AND m.discipler_id = discipleship.current_member_id())
    )
  );

-- SELECT policy exists from Phase 3. Deliberately NO update/delete policies.
```

Checklist instance rows + the discipler/admin **toggle** UPDATE policy (Phase 1
`_disciple_checklist_items`; snapshot at stage entry, GAPS #20, RULES #20):

```sql
CREATE TABLE discipleship.disciple_checklist_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  stage         discipleship.stage_label NOT NULL,   -- stage the snapshot was taken for
  sort_order    int  NOT NULL,
  text          text NOT NULL,
  is_done       boolean NOT NULL DEFAULT false,
  completed_at  timestamptz,
  UNIQUE (member_id, stage, sort_order)
);
ALTER TABLE discipleship.disciple_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY checklist_items_update ON discipleship.disciple_checklist_items
  FOR UPDATE TO authenticated
  USING (
    discipleship.is_agapay_admin()
    OR EXISTS (SELECT 1 FROM public.members m
               WHERE m.id = member_id
                 AND m.discipler_id = discipleship.current_member_id())
  )
  WITH CHECK (true);
-- No client INSERT/DELETE here: rows are created only by the snapshot fn (promote / add_disciple).
```

Meetings + the **completion trigger** (Phase 1 `_meetings`). Note: there is **no stored
engagement column** — "engagement reset" is emergent. Completing a meeting stamps
`completed_at`; the Phase 1 `disciple_engagement` view derives days-since as
`today − max(activity_logs.occurred_on, meetings.completed_at::date)`, so a completed
meeting resets the derived clock automatically. Cancel/no-show never stamp `completed_at`,
so they never reset it (matches prototype logic, INVENTORY §6).

```sql
CREATE TABLE discipleship.meetings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  discipler_id  uuid NOT NULL REFERENCES public.members(id),
  scheduled_at  timestamptz NOT NULL,               -- built from Manila-local date+time
  duration_min  int NOT NULL DEFAULT 60,
  mode          discipleship.meeting_mode NOT NULL DEFAULT 'inperson',
  place         text NOT NULL DEFAULT '',
  recurrence    discipleship.recurrence NOT NULL DEFAULT 'none', -- stored, NOT materialized (GAPS #8)
  status        discipleship.meeting_status NOT NULL DEFAULT 'upcoming',
  note          text,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE discipleship.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY meetings_insert ON discipleship.meetings
  FOR INSERT TO authenticated
  WITH CHECK (
    discipler_id = discipleship.current_member_id()
    AND (discipleship.is_agapay_admin()
         OR EXISTS (SELECT 1 FROM public.members m
                    WHERE m.id = member_id
                      AND m.discipler_id = discipleship.current_member_id())));

CREATE POLICY meetings_update ON discipleship.meetings
  FOR UPDATE TO authenticated
  USING (discipler_id = discipleship.current_member_id() OR discipleship.is_agapay_admin())
  WITH CHECK (discipler_id = discipleship.current_member_id() OR discipleship.is_agapay_admin());

-- Completion trigger: stamp completed_at exactly when status enters 'completed'.
CREATE OR REPLACE FUNCTION discipleship.stamp_meeting_completion()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;   -- cancel/noshow never counts as engagement
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_meeting_completion
  BEFORE UPDATE OF status ON discipleship.meetings
  FOR EACH ROW EXECUTE FUNCTION discipleship.stamp_meeting_completion();
```

Master checklist (admin-write) with `sort_order` (Phase 1 `_master_checklists`):

```sql
CREATE TABLE discipleship.master_checklists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage       discipleship.stage_label NOT NULL,
  sort_order  int NOT NULL,
  text        text NOT NULL,
  UNIQUE (stage, sort_order)
);
ALTER TABLE discipleship.master_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY master_read  ON discipleship.master_checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY master_write ON discipleship.master_checklists FOR ALL TO authenticated
  USING (discipleship.is_agapay_admin()) WITH CHECK (discipleship.is_agapay_admin());
```

Member-writing RPCs (Phase 1 `_rpcs`, `security definer`, `search_path=public,discipleship`).
Their exact signatures/behaviour that this phase calls:

```sql
-- Promote: note required, discipler-of-record or admin, rejects Leader, re-snapshots checklist,
-- writes members.discipleship_stage (Tierra vocab) + a stage_transitions audit row.
FUNCTION discipleship.promote_disciple(p_member_id uuid, p_note text) RETURNS discipleship.stage_label

-- Reassign: admin only, sets members.discipler_id for a set of disciples.
FUNCTION discipleship.reassign_disciples(p_member_ids uuid[], p_to_discipler uuid) RETURNS int  -- rows moved

-- Add disciple: admin only, minimal members insert (Tierra) + enrollment + initial stage_transition.
FUNCTION discipleship.add_disciple(...) RETURNS uuid  -- new member_id (out of Phase-4 write scope; listed for completeness)
```

Reference `promote_disciple` body (the guardrails the modal mirrors client-side):

```sql
CREATE OR REPLACE FUNCTION discipleship.promote_disciple(p_member_id uuid, p_note text)
RETURNS discipleship.stage_label
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, discipleship AS $$
DECLARE v_caller uuid := discipleship.current_member_id();
        v_cur  discipleship.stage_label;
        v_next discipleship.stage_label;
BEGIN
  IF coalesce(btrim(p_note),'') = '' THEN
    RAISE EXCEPTION 'A note is required to promote' USING errcode = 'check_violation';
  END IF;
  IF NOT (discipleship.is_agapay_admin()
          OR EXISTS (SELECT 1 FROM public.members m
                     WHERE m.id = p_member_id AND m.discipler_id = v_caller)) THEN
    RAISE EXCEPTION 'Not permitted to promote this disciple' USING errcode = 'insufficient_privilege';
  END IF;
  v_cur  := discipleship.stage_of(p_member_id);              -- maps Tierra value → stage_label
  v_next := CASE v_cur WHEN 'New Believer' THEN 'Growing'
                       WHEN 'Growing' THEN 'Leader'
                       ELSE NULL END;
  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Already a Leader — nothing to promote to' USING errcode = 'check_violation';
  END IF;
  UPDATE public.members
     SET discipleship_stage = discipleship.to_tierra_stage(v_next)  -- ← the ONLY Tierra write
   WHERE id = p_member_id;
  INSERT INTO discipleship.stage_transitions(member_id, from_stage, to_stage, note, changed_by)
  VALUES (p_member_id, v_cur, v_next, p_note, v_caller);
  PERFORM discipleship.snapshot_checklist(p_member_id, v_next);     -- fresh instance for new stage
  RETURN v_next;
END $$;
```

#### 3.0.B — Net-new (Phase 4): atomic master-checklist reorder RPC

Drag-reorder rewrites many `sort_order` values; doing it as N client UPDATEs trips the
`UNIQUE(stage, sort_order)` constraint mid-sequence and races. One `security invoker`
RPC (admin RLS still applies through the underlying table) rewrites the whole order in
one statement. Reorder **must not touch `disciple_checklist_items`** (RULES #20) — it only
writes `master_checklists`, so in-progress snapshots are untouched by construction.

```sql
-- in <TIMESTAMP>_discipleship_write_path.sql
CREATE OR REPLACE FUNCTION discipleship.set_master_checklist_order(
  p_stage discipleship.stage_label,
  p_ids   uuid[]                       -- item ids in the desired final order
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, discipleship AS $$
BEGIN
  IF NOT discipleship.is_agapay_admin() THEN
    RAISE EXCEPTION 'Admins only' USING errcode = 'insufficient_privilege';
  END IF;
  -- two-phase to dodge the unique constraint: park negative, then set final indices
  UPDATE discipleship.master_checklists
     SET sort_order = -1 - array_position(p_ids, id)
   WHERE stage = p_stage AND id = ANY(p_ids);
  UPDATE discipleship.master_checklists
     SET sort_order = array_position(p_ids, id) - 1
   WHERE stage = p_stage AND id = ANY(p_ids);
END $$;

GRANT EXECUTE ON FUNCTION discipleship.set_master_checklist_order(discipleship.stage_label, uuid[])
  TO authenticated;
```

> If the Phase 1 audit finds a genuinely missing write policy/trigger, add it in this same
> file with a `-- BACKFILL (was expected from Phase 1)` header and log it in NOTES.md.

---

### 3.1 — Client foundation for mutations

| # | Build | Path |
|---|---|---|
| 3.1.1 | `unwrap<T>(res)` — throws `res.error.message` (PostgrestError/RPC), returns `res.data as T`. Used by every `api.ts`. | `app/src/lib/supabase-unwrap.ts` |
| 3.1.2 | Optimistic helper `optimistic<TCtx>()` returning `onMutate`/`onError`/`onSettled` wiring (cancel → snapshot → patch → rollback → invalidate). | `app/src/lib/optimistic.ts` |
| 3.1.3 | Activity label ↔ enum map (`'One-on-one' ↔ 'one_on_one'`, …) + `activityTitle()` for timeline copy. | `app/src/lib/activity.ts` |
| 3.1.4 | Stage boundary map `toTierraStage()` / `fromTierraStage()` (verified against live CHECK). Extend Phase 1's `stageMap.ts` if it exists; do not duplicate. | `app/src/lib/stageMap.ts` |
| 3.1.5 | Manila datetime builder `toScheduledAt(dateISO, time)` → ISO with `+08:00`; `toManilaDate(d)` for `occurred_on`. Extend `app/src/lib/format.ts` (Asia/Manila already lives there). | `app/src/lib/format.ts` |

Shared optimistic pattern (every feature hook follows it):

```ts
// app/src/lib/optimistic.ts (shape)
export function makeOptimistic<TVars, TSnapshot>(opts: {
  keys: (v: TVars) => Array<QueryKey>            // queries to cancel + invalidate
  patch: (qc: QueryClient, v: TVars) => TSnapshot // apply optimistic edit, return rollback data
  rollback: (qc: QueryClient, snap: TSnapshot) => void
}) {
  return {
    onMutate: async (v: TVars) => {
      await Promise.all(opts.keys(v).map((k) => queryClient.cancelQueries({ queryKey: k })))
      return opts.patch(queryClient, v)
    },
    onError: (_e, _v, snap) => snap && opts.rollback(queryClient, snap as TSnapshot),
    onSettled: (_d, _e, v) =>
      opts.keys(v).forEach((k) => queryClient.invalidateQueries({ queryKey: k })),
  }
}
```

### 3.2 — Log activity (the 10-second hero; keep RULES #13)

- **Files:** `app/src/features/activity/api.ts`, `app/src/features/activity/mutations.ts`;
  rewire `LogSheet` in `app/src/components/sheets.tsx` to call the hook instead of
  `store.logActivity`. **No new required fields** — type (default One-on-one), date
  (default today), note (optional), one save button; unchanged.
- **api.ts:** `insertActivity(v)` → `supabase.from('activity_logs').insert({ member_id, logged_by: currentMemberId, type: toEnum(v.type), occurred_on: v.dateISO, note: v.note || null }).select().single()`.
- **Optimistic:** prepend a synthetic timeline event to `qk.disciple.timeline(memberId)`
  and recompute the disciple's derived last-activity to `max(existing, v.dateISO)` in the
  queue cache (a **backdated** log must not wrongly zero the clock — derive from the max
  date, never hardcode days=0). Move the disciple out of the red/amber group if the new
  max makes them Healthy. Bump the ring fraction.
- **Toast (onSuccess):** `Logged — thanks for walking with ${first}!` (warm, INVENTORY §1 screen 5).
- **Invalidate:** queue, disciple detail/timeline, disciples list, (admin) at-risk +
  discipler-load + stage aggregates (if the current user is admin these are cached).

### 3.3 — Meetings: schedule / complete / cancel / no-show

- **Files:** `app/src/features/meetings/api.ts`, `.../mutations.ts`; rewire
  `ScheduleSheet` + `OutcomeSheet` (`sheets.tsx`) and the `UpcomingCard` Cancel/No-show
  buttons (`app/src/routes/_discipler/meetings.tsx`).
- **schedule:** `insert({ member_id, discipler_id: currentMemberId, scheduled_at: toScheduledAt(dateISO,time), duration_min, mode, place, recurrence, status:'upcoming' })`. Recurrence is **stored, not materialized** — a `weekly`/`biweekly` row creates exactly one row (GAPS #8); toast varies (`Meeting scheduled — repeats weekly`). Optimistic-append to `qk.meetings.list('upcoming')`.
- **complete:** `update({ status:'completed', note }).eq('id',id)` → trigger stamps
  `completed_at` → engagement clock for that disciple resets *by derivation*. Optimistic:
  move row upcoming→past, prepend a `meeting` timeline event, recompute that disciple's
  queue engagement to Healthy. Toast `Meeting completed — well done!`.
- **cancel / noshow:** `update({ status })` only; **no** engagement change (trigger nulls
  `completed_at`). Toasts `Meeting cancelled` / `Marked as no-show — maybe try a different day?`.
  (GAPS #18: one-tap, destructive-ish — optional undo-in-toast is a later polish, not this phase.)
- **Invalidate:** meetings list; on complete also queue + disciple timeline + admin aggregates.

### 3.4 — Checklist toggle (discipler-of-record + admin, GAPS #20)

- **Files:** `app/src/features/checklist/api.ts`, `.../mutations.ts`; rewire the
  interactive checkboxes in `app/src/components/disciple-detail.tsx` (used by both the
  discipler profile and the admin detail modal).
- **api.ts:** `toggleItem(v)` → `update({ is_done: v.next, completed_at: v.next ? nowISO() : null }).eq('id', v.itemId)`. Toggling on stamps `completed_at` (surfaces as a `check` timeline event, INVENTORY §1 screen 4); off clears it.
- **Optimistic:** flip `is_done` in `qk.disciple.checklist(memberId)`; the checklist `%`
  is **derived** in the read hook (never stored). No toast (matches prototype — silent flip).
- **Invalidate:** `qk.disciple.checklist(memberId)`, `qk.disciple.detail(memberId)`
  (progress bar), disciples list (mini checklist bar), admin funnel avg-checklist.

### 3.5 — Promote via RPC (RULES #14; note enforced client + server)

- **Files:** `app/src/features/promotion/api.ts`, `.../mutations.ts`; rewire `PromoteModal`
  (`sheets.tsx`). The modal already keeps Confirm disabled until the note is non-empty
  (client guard); the RPC re-enforces (server guard).
- **api.ts:** `promote(v)` → `supabase.rpc('promote_disciple', { p_member_id: v.memberId, p_note: v.note })` → returns the new `stage_label`.
- **Optimistic:** set stage pill to next stage, replace the disciple's checklist cache with
  a fresh snapshot of the new stage's master items (all `is_done:false`), prepend a `stage`
  timeline event carrying the note. On error (empty note / already-Leader / not permitted)
  roll back and toast the server message.
- **Invalidate:** disciple detail/timeline/checklist, queue, admin stage funnel + stage
  trend, **and the Tierra-backed member read** (stage pill in the directory-derived views).
  Toast `Promoted — a new chapter begins!`.

### 3.6 — Bulk reassign via RPC (admin; key behavior #6)

- **Files:** `app/src/features/reassign/api.ts`, `.../mutations.ts`; rewire the bulk-action
  bar in `app/src/routes/admin/disciples.tsx`.
- **api.ts:** `reassign(v)` → `supabase.rpc('reassign_disciples', { p_member_ids: v.ids, p_to_discipler: v.toMemberId })` (admin-only; non-admins get `insufficient_privilege`).
- **Behavior:** on success **clear the selection** (local state) and toast
  `${n} disciple${n>1?'s':''} reassigned to ${name}`.
- **Optimistic:** patch `discipler_id` on the affected rows in `qk.disciples.list`.
- **Invalidate:** disciples list, discipler-load, both source/target queues, at-risk list.
  Tierra directory reflects instantly (RPC wrote `members.discipler_id`).

### 3.7 — Admin master-checklist CRUD + reorder (RULES #20)

- **Files:** `app/src/features/master-checklist/api.ts`, `.../mutations.ts`; rewire
  `app/src/routes/admin/checklists.tsx` (add input, trash, HTML5 drag-reorder).
- **add:** `insert({ stage, text, sort_order: <max+1> })`.
- **edit text:** `update({ text }).eq('id', id)` (optional inline edit; keep if present).
- **remove:** `delete().eq('id', id)`.
- **reorder:** `supabase.rpc('set_master_checklist_order', { p_stage, p_ids })` (§3.0.B).
- **Guarantee (test it):** none of these touch `disciple_checklist_items`; a disciple
  mid-stage keeps their snapshot. Optimistic edits patch **only** `qk.masterChecklist(stage)`.
- **Invalidate:** `qk.masterChecklist(stage)` only. Toasts `Item added` / `Item removed`.

### 3.8 — Retire the write side of the demo store

Behind the `VITE_DEMO_MODE` flag (Phase 2), keep `store.tsx` mutations as the demo
fallback only; the real screens now call the feature hooks. Add a decision-log entry to
NOTES.md: *"2026-07-1x — recurrence stored not materialized (GAPS #8); engagement reset is
emergent from `completed_at`/`occurred_on`, no stored field (RULES #18)."*

---

## 4. Interfaces & contracts

**Mutation variable types** (`app/src/features/*/types.ts`):

```ts
interface LogActivityVars   { memberId: string; type: ActivityType; dateISO: string; note: string }
interface ScheduleMeetingVars { memberId: string; dateISO: string; time: string;
                                durationMin: number; mode: MeetingMode; place: string; recurrence: Recurrence }
interface CompleteMeetingVars { meetingId: string; memberId: string; note: string }
interface MeetingStatusVars   { meetingId: string; status: 'cancelled' | 'noshow' }
interface ToggleChecklistVars { itemId: string; memberId: string; next: boolean }
interface PromoteVars         { memberId: string; note: string }            // note non-empty (client+server)
interface ReassignVars        { ids: Array<string>; toMemberId: string }
interface MasterAddVars       { stage: Stage; text: string }
interface MasterEditVars      { id: string; text: string }
interface MasterRemoveVars    { id: string; stage: Stage }
interface MasterReorderVars   { stage: Stage; ids: Array<string> }
```

**RPC signatures (SQL → TS wrapper):**

| RPC | Args | Returns | Guard |
|---|---|---|---|
| `promote_disciple` | `p_member_id uuid, p_note text` | `stage_label` | note required; discipler-of-record\|admin; rejects Leader; writes `members.discipleship_stage` |
| `reassign_disciples` | `p_member_ids uuid[], p_to_discipler uuid` | `int` (moved) | admin only; writes `members.discipler_id` |
| `set_master_checklist_order` | `p_stage stage_label, p_ids uuid[]` | `void` | admin only; master table only |

**Query keys touched** (per-feature keys from Phase 3; invalidation matrix):

| Mutation | Optimistic cache | Invalidate |
|---|---|---|
| log activity | `disciple.timeline`, `queue` | queue, disciple.detail/timeline, disciples.list, admin at-risk/discipler-load/funnel |
| schedule | `meetings.list('upcoming')` | meetings.list |
| complete | `meetings.list`, `disciple.timeline`, `queue` | meetings.list, queue, disciple.detail/timeline, admin aggregates |
| cancel / noshow | `meetings.list` | meetings.list |
| checklist toggle | `disciple.checklist` | disciple.checklist/detail, disciples.list, admin funnel |
| promote | `disciple.detail/checklist/timeline`, `queue` | those + queue + admin funnel/stageTrend + member reads |
| reassign | `disciples.list` | disciples.list, discipler-load, queues, at-risk |
| master add/edit/remove/reorder | `masterChecklist(stage)` | `masterChecklist(stage)` only |

**Envelope:** supabase-js `{ data, error }` unwrapped by `unwrap<T>()`; errors surface as
`Error(message)` → mutation `onError` → rollback + toast. No custom envelope on top.

**Boundary constant:** `stageMap.ts` — `toTierraStage(stage_label) → <live CHECK value>`,
`fromTierraStage(value) → stage_label`; UI never renders a Tierra literal.

---

## 5. Test plan

Test dirs: SQL/RLS under `supabase/tests/` (pgTAP or plain `psql` assertion scripts run by
the **rls-check** skill against the local stack); unit under `app/src/**/__tests__` (Vitest);
e2e with Playwright (Phase-3 harness).

### 5.1 RLS / RPC write scenarios (rls-check skill; seeded users from Phase 1)

Set the session with `SET request.jwt.claims` / `auth.uid()` per seeded user, then:

| # | As | Statement | Expect |
|---|---|---|---|
| R1 | Alma | `INSERT activity_logs(member_id=<d1 Alma's>, logged_by=Alma, …)` | **allow** |
| R2 | Alma | `INSERT activity_logs(member_id=<d12 Josie's>, …)` | **deny** (RLS) |
| R3 | Alma | `UPDATE disciple_checklist_items … WHERE member_id=<d1>` | **allow** |
| R4 | Alma | `UPDATE disciple_checklist_items … WHERE member_id=<d12>` | **deny** |
| R5 | Alma | `INSERT meetings(member_id=<d1>, discipler_id=Alma, …)` | **allow** |
| R6 | Alma | `INSERT meetings(member_id=<d12>, …)` | **deny** |
| R7 | Alma | `UPDATE public.members SET discipleship_stage=… WHERE id=<d1>` | **deny** (no direct Tierra grant) |
| R8 | Alma | `UPDATE public.members SET discipler_id=… WHERE id=<d1>` | **deny** |
| R9 | Alma | `SELECT reassign_disciples(ARRAY[<d1>], <Josie>)` | **deny** (`insufficient_privilege`, admins only) |
| R10 | Alma | `SELECT promote_disciple(<a New-Believer disciple>, '')` | **deny** (`A note is required`) |
| R11 | Alma | `SELECT promote_disciple(<a Leader disciple, e.g. d1>, 'ready')` | **deny** (`Already a Leader`) |
| R12 | Alma | `SELECT promote_disciple(<s14 New Believer? — use an Alma-owned NB>, 'ready to grow')` | **allow**; `members.discipleship_stage` advances (Tierra value); a `stage_transitions` row exists; checklist re-snapshotted |
| R13 | Alma | `UPDATE discipleship.activity_logs …` / `DELETE …` | **deny** (no policy → append-only) |
| R14 | Ptr. Danilo | `SELECT reassign_disciples(ARRAY[<d1>], <Josie>)` | **allow**; `members.discipler_id` = Josie |
| R15 | Ptr. Danilo | `INSERT/DELETE master_checklists`, `set_master_checklist_order(...)` | **allow** |
| R16 | Alma | `INSERT master_checklists(...)` / `set_master_checklist_order(...)` | **deny** |
| R17 | Ptr. Danilo | complete a meeting → assert `completed_at` set and `disciple_engagement` days-since=0 for that disciple | **pass** |
| R18 | Ptr. Danilo | cancel a meeting → assert `completed_at` NULL and engagement **unchanged** | **pass** |
| R19 | anyone | edit a master item, then re-select `disciple_checklist_items` for an in-progress disciple | rows **unchanged** (RULES #20) |

(Use the Phase-1 seed to resolve concrete `member_id`s. If Alma owns no New Believer,
seed one or reuse `add_disciple` in the fixture so R12 has a valid subject.)

### 5.2 Unit (Vitest)

- `stageMap`: `fromTierraStage(toTierraStage(s)) === s` for all three; unknown value throws.
- `activity`: label↔enum round-trips for all five types.
- `format.toScheduledAt('2026-07-15','19:00')` yields the correct `+08:00` instant;
  `toManilaDate(now)` bucket-stable across a UTC-midnight boundary.
- Optimistic reducers: log-activity patch uses `max(existing, chosenDate)` (backdated log
  does **not** zero the clock); promote patch resets checklist to all-undone; reassign patch
  updates only selected ids.

### 5.3 Integration / e2e (Playwright, local seed + demo off)

For each mutation: perform the UI action → assert optimistic change is instant → await
network idle → assert the value survived a refetch (UI == server). Specifically:
log activity moves a disciple out of the red group and drops the ring count; complete a
meeting moves it upcoming→past and resets its disciple's engagement; toggle persists across
reload; promote flips the stage pill and resets the checklist; bulk reassign clears the
selection and re-buckets rows; master edit does not change any disciple's checklist.
**Cross-app check:** after promote and after reassign, open the Tierra directory row for
that member and confirm stage / discipler match.

---

## 6. Exit gate

**Single condition:** with the local seed and `VITE_DEMO_MODE=off`, every Phase-4 mutation
round-trips — the optimistic UI state equals the state after a forced refetch — **and** the
full rls-check suite (§5.1, R1–R19) passes, proving: cross-discipler writes denied, direct
`public.members` writes denied, promote-without-note and promote-Leader rejected server-side,
`activity_logs` has no UPDATE/DELETE grant (append-only), the completion trigger resets
derived engagement while cancel/no-show do not, master edits leave in-progress snapshots
untouched, and the Tierra directory shows the correct stage/discipler after promote/reassign.
`pnpm exec tsc --noEmit && pnpm lint && pnpm build` green.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Tierra safety (prime directive).** A stray `members` write outside the two columns corrupts the shared directory. | Only `promote_disciple` / `reassign_disciples` / `add_disciple` touch `public.members`, each `security definer` and column-scoped; **no** client-side `members` UPDATE grant (R7/R8 prove it). Never add a `members` policy. |
| Stage-label drift (Tierra stores `Newbie`/live shows `New Friends`; Agapay says `New Believer`). | Verify the live CHECK before wiring (Prereqs); all writes go through `to_tierra_stage()`; unit test round-trips; archive findings in GAPS. |
| Storing derived engagement (RULES #18) sneaks back in via an "engagement reset". | There is **no engagement column**; reset is emergent from `completed_at`/`occurred_on`. Optimistic code derives days from `max()` timestamps, never writes a days field. |
| Append-only timeline violated by an "edit note" convenience. | `activity_logs` ships with zero UPDATE/DELETE policies (R13); corrections are new `note` rows (GAPS #11). |
| Reorder trips `UNIQUE(stage, sort_order)` or races. | Single atomic `set_master_checklist_order` RPC with a two-phase negative-parking rewrite; admin-guarded. |
| Master edit mutates in-progress instances. | Separate tables by design; reorder/CRUD write only `master_checklists`; R19 asserts snapshots unchanged. |
| Optimistic/rollback desync (stale cache after error). | Shared `makeOptimistic` cancels queries first, snapshots, and always `invalidateQueries` in `onSettled`; server message shown on rollback. |
| 10-second log flow regressing under real IO. | No new required fields (RULES #13); optimistic close + toast fire immediately; network settles in background. |
| Backdated activity wrongly zeroing the clock. | Optimistic patch uses `max(existing, chosenDate)`; covered by unit test. |
| Recurrence misread as materialized. | `weekly`/`biweekly` inserts exactly one row; decision logged in NOTES (GAPS #8); generator explicitly deferred to v1-out-of-scope. |

## 8. Rollback / safety

- **Migration:** the only net-new object is `set_master_checklist_order`. Roll back with
  `DROP FUNCTION IF EXISTS discipleship.set_master_checklist_order(discipleship.stage_label, uuid[]);`
  (write a paired down migration; never edit the applied file). Reorder then falls back to
  the disabled state — no data loss, master items keep their `sort_order`.
- **Client:** feature hooks are additive; reverting the `sheets.tsx` / route rewires to the
  `store.tsx` calls restores the prototype behavior. With `VITE_DEMO_MODE=on` the app runs
  entirely on the in-memory store, untouched.
- **Data safety:** all Agapay writes are additive rows in the `discipleship` schema plus the
  two column-scoped RPCs. Disabling the Agapay app leaves `public.members` in whatever
  stage/discipler state the RPCs last set — the directory keeps working (Model 1). No Tierra
  table, policy, trigger, or non-target column is ever altered; a full Agapay teardown is
  `DROP SCHEMA discipleship CASCADE` with the directory unaffected.
```
