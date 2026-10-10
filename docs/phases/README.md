# Agapay — Phased execution plan (index)

This folder holds the per-phase specs that elaborate [`ROADMAP.md`](../../ROADMAP.md).
Each phase doc is self-contained: objective, prerequisites, ordered work items with
concrete SQL/TS, interfaces & contracts, a runnable test plan, a single exit gate,
risks, and rollback. Read them alongside the binding sources they cite:
[`NOTES.md`](../../NOTES.md) (locked decisions), `CLAUDE.md` (domain vocabulary),
`design/design_handoff_agapay/RULES.md` (engineering rules #1–#23), and
`design/GAPS.md` (open questions #1–#32).

## Phases

| # | Title | Doc | Effort | Depends on | Exit gate (one testable condition) |
|---|-------|-----|--------|------------|------------------------------------|
| 0 | Foundations | [phase-0-foundations.md](./phase-0-foundations.md) | ½–1 day | — | `supabase db reset` clean with the five Tierra tables + live-verified `discipleship_stage` CHECK `('Newbie','Growing','Leader')`; `pnpm build` green; `list_tables` drift archived in `design/GAPS.md`. |
| 1 | Discipleship schema, RLS & RPCs (data layer) | [phase-1-data-layer.md](./phase-1-data-layer.md) | 1–2 days | 0 | On a clean reset + seed, `supabase test db` reports every pgTAP scenario green (R1/R2 cross-discipler deny, T1/T3 no direct member write, P1/P2 promote guards, T4 Tierra untouched); `gen types --schema public,discipleship` compiles. |
| 2 | Auth + role shell | [phase-2-auth-shell.md](./phase-2-auth-shell.md) | ½–1 day | 0, 1 | `VITE_DEMO_MODE=false` build: Playwright redirect matrix green (unauth→/login, Alma→queue & bounced from /admin, Ptr. Danilo→/admin & bounced from /, sign-out clears session, bad creds stay); tsc/lint/build green; `agapay_my_profile()` rls-check rows correct. |
| 3 | Read path (queue first) | [phase-3-read-path.md](./phase-3-read-path.md) | 2–3 days | 0, 1, 2 | With local seed + demo off, `gen:types && tsc --noEmit && lint && test && build` all pass — including the parity integration suite and RLS suite R1–R10 — and a grep guard confirms no stored engagement/queue/checklist-% field (RULES #18). |
| 4 | Write path (mutations) | [phase-4-write-path.md](./phase-4-write-path.md) | 2–3 days | 0, 1, 2, 3 | With seed + demo off, every mutation round-trips (optimistic == post-refetch) and rls-check R1–R19 passes (cross-discipler writes denied, direct member writes denied, promote guards, append-only, completion-trigger reset, master edits leave snapshots untouched); tsc/lint/build green. |
| 5 | Analytics + PWA + polish | [phase-5-analytics-pwa.md](./phase-5-analytics-pwa.md) | 1–2 days | 0, 1, 2, 3, 4 | tsc/lint/build + Docker image green; app installs to a phone home screen and launches standalone; airplane-mode hard-reload shows the shell (not a white screen); stage-growth chart renders real Asia/Manila month buckets from `discipleship.stage_trend()`. |
| 6 | Production cutover | [phase-6-cutover.md](./phase-6-cutover.md) | 1 day + 1–2 wk pilot | 0, 1, 2, 3, 4, 5 | After ≥1 week on prod: (a) T8–T10 pass (real login, per-discipler queue, engagement reset, promote audit), (b) `get_advisors` zero ERROR-level in `discipleship`, (c) Tierra diff shows changes only in `members.discipleship_stage`/`discipler_id` on RPC-attributable rows. |

## How to use this plan

- **Sequential, gated.** Do not start a phase until the previous phase's exit gate is
  green. Each phase ships behind the previous phase's UI — the deployed prototype at
  `discipleship.questlaguna.org` keeps working at every step (flip `VITE_DEMO_MODE=true`
  to fall back at any time).
- **Prime directive, every phase.** Never modify Tierra's `public` schema, policies, or
  data — except `members.discipleship_stage` / `members.discipler_id` via the
  `security definer` RPCs, plus minimal-member inserts for brand-new believers. Phases
  0–5 issue **zero** remote DDL; production is touched only in Phase 6.
- **Local first.** All development and proving happens against a local Supabase stack.
  Never `apply_migration` / `db push` to `ncijotdkovijkcpqnlbv` before Phase 6.
- **Standing verification (each phase):** `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
  green; `rls-check` after any policy migration; `design-compare` at 375px/1280px; update
  `NOTES.md` + `GAPS.md`.
- **Skills.** Phase 0 authors four Claude Code skills (`migration`, `feature-slice`,
  `rls-check`, `design-compare`); later phases follow those procedures rather than
  improvising.

## Current status

**Phases 0–1 are being executed and verified now; Phases 2–6 are documented but not yet
built.** The consistency review below flags items that must be reconciled — most
critically, the schema-shape and stage-vocabulary split between Phase 1 (as built) and
Phases 3/4/6 (as written) — before the later phases are implemented against Phase 1's
actual output.

---

## Consistency review

Findings from a cross-read of all seven phase docs against each other, `ROADMAP.md`,
`NOTES.md`, `CLAUDE.md`, `RULES.md`, and `GAPS.md`. Ordered by severity. **Because
Phase 1 is the one currently being built, its shape is the contract; the later phases
are the ones that must be brought into line** (or Phase 1 changed deliberately, with the
decision logged in `NOTES.md`).

### 🔴 Contradictions (blocking — must be reconciled before Phase 3+ is built)

**C1 — Two incompatible schema designs (behavioral-table foreign key + RPC args).**
Phase 1 keys every behavioral table on `disciple_id → discipleship.disciple_profiles(id)`
(phase-1 §3.5/§3.6/§3.7/§3.8/§3.9) and its RPCs take disciple-profile ids:
`promote_disciple(p_disciple uuid, p_note)`, `reassign_disciples(p_disciple_ids uuid[], p_to_member)`
(phase-1 §3.9, §4). Phases 3, 4, and 6 instead key on `member_id → public.members(id)`
and call `promote_disciple(p_member_id, …)` / `reassign_disciples(p_member_ids uuid[], p_to_discipler)`
(phase-4 §3.0.A / §3.5 / §3.6 / §4; phase-6 §3.2). Phase 3 is a *third* variant: its
engagement view joins `activity_logs al … al.disciple_id = m.id` — a column named
`disciple_id` but holding the **member** id (phase-3 §3.1, lines ~251). These cannot all
be built. **Decision needed:** pick disciple-profile-keyed (Phase 1 as-is) or
member-keyed (Phases 3/4/6), then rewrite the losing side.

**C2 — 🚨 Stage vocabulary stored in the DB contradicts the locked decision.**
`NOTES.md` (2026-07-10 Supabase decision), `CLAUDE.md`, `GAPS.md` #27/#32, **Phase 0 §4
("locked here")**, and **Phase 1 §3.1** all lock that the DB stores only
`'Newbie' | 'Growing' | 'Leader'` and that `'New Believer'` is a **UI-only** label,
"never in SQL." Phase 4 §3.0.A defines `CREATE TYPE discipleship.stage_label AS ENUM
('New Believer','Growing','Leader')` and its `promote_disciple` compares/stores
`'New Believer'`; Phase 6 §3.2 inserts `stage_transitions.to_stage = stage_from_directory(...)`
which returns `'New Believer'`. This directly violates the locked boundary rule.
It also breaks Phase 5: phase-5 §3.1 reads `stage_transitions.to_stage` **expecting
`'Newbie'`** and maps `Newbie→New Believer` client-side — but Phase 6 would have stored
`'New Believer'`, so `dbStageToStage('New Believer')` (input enum `'Newbie'|'Growing'|'Leader'`)
fails. **Fix:** Phases 4 and 6 must store Tierra vocab (`Newbie`) in `discipleship`
enums/audit rows and map to the UI label only at the client boundary, per Phase 0/1.

**C3 — `disciple_engagement` view defined twice, incompatibly.** Phase 1 §3.10:
`disciple_id = dp.id`, includes a server-derived `engagement` column
(`healthy|cooling|at_risk`), `days_since` via clean date subtraction. Phase 3 §3.1
redefines the same view with `disciple_id = dp.member_id`, **drops the `engagement`
column** (derives it client-side), adds `life_group_id/name`, `last_activity_at/type`,
`checklist_done/total`, `in_stage_since`, and computes
`days_since = (date_trunc('day',ts) - date_trunc('day',ts))::int / 86400` — which is
invalid SQL (an `interval` cannot cast to `int`; it is missing `extract(epoch …)`).
Phase 1's own `discipler_load` view joins `disciple_engagement e ON e.disciple_id = dp.id`
and filters `e.engagement = 'at_risk'` (phase-1 §3.10) and Phase 1 test **R5** reads the
`engagement` column — both the join key and the column disappear under Phase 3's
redefinition, so `discipler_load` and R5 break. Phase 3 frames this as "verify/amend
Phase-1 columns," but it is a breaking wholesale redefinition, not an additive amendment.

**C4 — Column-name drift on shared tables (Phase 3 reads names Phases 1/4 never create):**
- `activity_logs` timestamp: Phase 1 §3.6 and Phase 4 §3.0.A = `occurred_on date`; Phase 3
  reads `occurred_at` (timestamptz) in the engagement view, `disciple_timeline`, and
  `disciple_attendance()` (phase-3 §3.1/§3.2). `occurred_at` does not exist.
- `disciple_checklist_items`: Phase 1 §3.5 = `done_at`, `text`, `position`, `disciple_id`;
  Phase 4 §3.0.A = `completed_at`, `text`, `sort_order`, `member_id`; Phase 3 reads
  `completed_at`, **`item_text`**, `sort_order` (phase-3 §3.2). `item_text` exists in no
  phase (both define `text`); `sort_order` ≠ `position`; `completed_at` ≠ `done_at`.
- `milestones` ordering: Phase 1 §3.8 = `position`; Phase 3 orders by `sort_order` (§3.2).
- `stage_transitions` is described five ways: timestamp column `transitioned_at` (P1 §3.9)
  vs `created_at` (P3 §3.2, P6 §3.2) vs `changed_at` (P5 §3.1); actor `transitioned_by`
  (P1) vs `changed_by` (P4 §3.0.A); FK `disciple_id` (P1) vs `member_id` (P4/P5/P6).

**C5 — `promote_disciple` return type and missing helper functions.** Phase 1 §3.9
returns `TABLE(member_id, from_stage text, to_stage text)`; Phase 4 §3.0.A returns a
scalar `discipleship.stage_label`. Phase 4's body also calls
`discipleship.stage_of(p_member_id)` and `discipleship.to_tierra_stage(v_next)` — helper
functions **Phase 1 never defines** (Phase 1 ships only the app-side `stages.ts` mapping).
So Phase 4's reference implementation cannot run against Phase 1's schema.

**C6 — `add_disciple` authorization contradiction.** Phase 1 §3.9 + tests **P6/P7**: a
discipler may enroll their own disciple (Alma `add_disciple('Test NB')` → allow). Phase 4
§3.0.A comment says "Add disciple: **admin only**." Contradiction on who may enroll a new
believer (NOTES.md leans to Phase 1: "new believers may be inserted … discipler at import").

**C7 — Completion-trigger scope differs on a "verify-not-redefine" object.** Phase 1 §3.7
trigger is `BEFORE INSERT OR UPDATE` and stamps `completed_at` on an insert already
`status='completed'`. Phase 4 §3.0.A re-states it as `BEFORE UPDATE OF status` only — a
meeting inserted as completed would never stamp `completed_at`, silently breaking the
engagement reset for that path.

**C8 — `stage_trend` access model changes between Phase 3 and Phase 5.** Phase 1 §3.10 +
Phase 3 §3.4 treat `stage_trend` as a `security_invoker` view with `GRANT SELECT … TO
authenticated`, read directly by the admin slice (`fetchStageTrend()` = a view select).
Phase 5 §3.1 flips it to `security_invoker = off`, **revokes** view SELECT from
`authenticated`, and forces access through a new admin-only `SECURITY DEFINER`
`stage_trend()` RPC. Building Phase 3 to spec then Phase 5 to spec regresses the admin
chart (Phase 3's direct-view fetch 401/403s after Phase 5's revoke). The two phases also
disagree on the column set (`month` vs `month_label`/`m_start`) and trailing window.

### 🟠 Gaps (missing ownership / unresolved)

**G1 — PostgREST schema exposure is unassigned.** Phase 3 hard-depends on
`supabase.schema('discipleship').from(...)` calls and its prereq claims Phase 0 added
`discipleship` to `[api].schemas` in `config.toml` (phase-3 §2). But Phase 0 §3.1 says
"keep defaults" and never adds it — and the `discipleship` schema doesn't exist until
Phase 1. Phase 2 §2 treats the exposure as an uncertain "*if* Phase 1 chose to expose…".
**No phase actually owns editing `config.toml [api].schemas`.** Without it every Phase 3/4/5
client call to the `discipleship` schema 404s. Assign this to Phase 1 (when the schema is
created) or Phase 3 §3.0.

**G2 — Baseline reproduces a members RLS policy the live introspection contradicts.**
Phase 0 §3.2 reconstructs `members_read_public` = `FOR SELECT USING (not is_archived)`
(anon **and** auth readable), and Phase 0 tests 6 & 8 assert anon can read non-archived
members. Phase 1's grounding facts (verified live via MCP 2026-07-11, declared
"authoritative over the repo SQL files") say the live policy is **`members_read_auth`** =
`auth.role()='authenticated' AND NOT is_archived` — a different name **and** authenticated-
only (no anon read). Phase 3 §3.4/§7 then leans on "existing `members_read_public`." The
baseline and the two anon-read tests should be corrected to the live `members_read_auth`
before Phase 1's tests are trusted.

**G3 — Boundary helper functions referenced but never defined.** Phase 4 uses
`discipleship.stage_of()` / `discipleship.to_tierra_stage()`; Phase 6 uses
`discipleship.stage_from_directory()` / `discipleship.cohort_from_joined()`, each described
as "reuse Phase 1's." Phase 1 defines none of these in SQL (only the app-side `stages.ts`
`dbStageToUi`/`uiStageToDb`). Phase 6 hedges with a fallback definition; Phase 4 does not.
Decide whether stage mapping lives in SQL or only in the client, and define it once.

### 🟡 Ordering / dependency problems

**O1 — Phase 3 depends on Phase-1 outputs Phase 1 does not produce.** `disciple_engagement`
columns `life_group_id/name`, `last_activity_at/type`, `checklist_done/total`,
`in_stage_since`, and an `engagement`-less shape (phase-3 §3.1/§4) are not in Phase 1's view
(§3.10); plus the PostgREST exposure of G1. Phase 3 says "amend Phase 1," but per C3 the
amendment is breaking, so the "verify columns exist" step fails rather than no-ops.

**O2 — Phase 4's "audit, don't redefine" premise is false against Phase 1.** Phase 4 §3.0
instructs engineers to "audit that the Phase-1 contracts in §3.0.A exist **exactly as
written**." But §3.0.A does not match Phase 1: different enum vocab (C2), different FK
columns (C1/C4), different table columns (C4), and helper functions Phase 1 lacks (C5).
As written, that audit can never pass — Phase 4 is effectively specifying a *different*
Phase 1.

**O3 — Phase 5 retroactively changes a contract Phase 3 shipped against.** See C8: the
`stage_trend` access flip means Phase 3 and Phase 5 cannot both be implemented verbatim
without a mid-plan rewrite of the admin analytics read path.

### 🟢 Consistent / non-issues (checked, no action)

- **Rollback coverage is complete.** Every phase (0–6) has a `§8 Rollback / safety`
  section; the app-level `VITE_DEMO_MODE=true` fallback and `DROP SCHEMA discipleship
  CASCADE` teardown are consistent across docs. No missing-rollback finding.
- **Seed head-counts reconcile.** Alma 11 + Josie 10 (TRIBES 21) + CHOSEN GENERATION 8 +
  SOULDIERS 14 = 43 disciples / 4 disciplers / 3 circles, matching `NOTES.md`; admin R8
  (43) and the per-discipler denies (R1/R3) are internally consistent.
- **Prime-directive discipline is uniform.** All phases confine Tierra writes to the two
  allowed `members` columns via `security definer` RPCs and assert it (T4 / R7-R8 / T5).
- **Minor: RULES citation slip.** Phase 1 §3 cites "each table carries its RLS in the same
  file (RULES #19)"; RULES #19 is actually "role scoping enforced server-side." The
  same-file-RLS convention is real (ROADMAP Phase 1) but is not #19. Cosmetic; fix the
  citation.

---

## Reconciliation directive — Phase 1 *as built and tested* is the contract

The consistency review above compared seven independently-authored docs. Phase 1 has
since been **implemented as real migrations under `supabase/migrations/` and verified
by `test/rls/run.sh` (30 assertions, all green)**. That executed schema — not any
doc's SQL sketch — is authoritative. The later phase docs must be reconciled to it
before they are built. Resolutions:

- **C1 (keying): RESOLVED → `disciple_id` → `discipleship.disciple_profiles(id)`.**
  Every behavioral table (activity_logs, meetings, checklist items, milestones,
  stage_transitions) keys on `disciple_id`; RPCs take disciple-profile ids
  (`reassign_disciples(uuid[], p_to_member)` takes profile ids + a target member).
  Phases 3/4/6 must switch from `member_id` keying to `disciple_id`.
- **C2 (stage vocab): RESOLVED → the `discipleship` schema stores DB vocab
  (`'Newbie'/'Growing'/'Leader'`) everywhere.** `master_checklist_items.stage`,
  `stage_transitions.from/to_stage`, and the RPC args are DB vocab; `'New Believer'`
  appears only in view output (`to_ui_stage()`) and the React client. Verified by
  test J. Phases 4/6 must drop any `stage_label AS ENUM ('New Believer',…)` and store
  `'Newbie'`; Phase 5 reads `'Newbie'` from `stage_transitions`.
- **C3 (view redefinition): RESOLVED → keep Phase 1's `disciple_engagement`** (keys on
  `dp.id`, carries the server-derived `engagement` column, `days_since` via date
  subtraction). Phase 3 must **add** columns (life-group, checklist counts) without
  changing the key or dropping `engagement`, and must not use the invalid
  `interval::int` expression.
- **C5/G3 (mapping + signatures): RESOLVED → stage mapping lives in SQL**
  (`discipleship.to_ui_stage/to_db_stage/next_db_stage`) *and* the client `stages.ts`.
  RPC signatures as built: `promote_disciple(uuid,text)→void`,
  `reassign_disciples(uuid[],uuid)→int`, `add_disciple(text,text,text,uuid,text)→uuid`.
  Phase 4 must match; the `stage_of()`/`to_tierra_stage()` helpers it invented are
  unnecessary.
- **C6 (add_disciple authz): RESOLVED → admin OR the disciple's own discipler** may
  enroll (matches NOTES.md + tested). Phase 4's "admin only" note is wrong.
- **C7 (completion trigger): RESOLVED → `BEFORE INSERT OR UPDATE`** so a meeting logged
  directly as completed still stamps `completed_at`.
- **C8 (stage_trend): OPEN — Phase 5 owns it.** Phase 1 ships `stage_distribution`
  (current snapshot, `security_invoker` view); true monthly trend needs transition
  replay and is Phase 5's deliverable. Phase 5 must pick one access model (view vs RPC)
  and Phase 3's admin chart must consume whatever Phase 5 finalizes (or read
  `stage_distribution` until then).
- **G1 (PostgREST exposure): RESOLVED** — `supabase/config.toml` `[api].schemas`
  includes `discipleship` (added in Phase 0).
- **G2 (members RLS): RESOLVED** — the baseline now reproduces the live
  `members_read_auth` policy (authenticated-only, verified via MCP 2026-07-11); anon
  can read neither members nor any `discipleship` table (tested).
- **Minor RULES #19 citation:** the same-file-RLS convention is a ROADMAP Phase-1 rule,
  not RULES #19 (which is server-side role scoping). Fix the citation in phase-1 doc.

**Net:** Phases 2–6 remain accurate in intent and structure; their SQL/TS sketches must
be brought into line with the executed Phase 1 contract above before implementation.
