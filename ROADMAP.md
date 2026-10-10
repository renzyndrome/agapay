# Agapay — Execution Roadmap (prototype → production)

> Written 2026-07-10. Current state: clickable prototype with in-memory seed data
> live at discipleship.questlaguna.org (Docker/nginx on Dokploy). Target: real app
> on the shared Supabase project (`ncijotdkovijkcpqnlbv`) integrated with the
> Tierra directory. Architecture decisions already locked (see NOTES.md):
> **Model 1** — the directory (`public.members`) owns identity, stage, and
> discipler assignment; Agapay writes those back only through locked-down RPCs;
> everything behavioral lives in a dedicated `discipleship` schema; shared
> `auth.users` with Tierra.

**Prime directive across all phases:** never modify Tierra's schema, policies, or
data except `members.discipleship_stage` / `members.discipler_id` via the
`security definer` RPCs, and minimal-member inserts for brand-new believers.

**Rule of thumb per phase:** it ships behind the previous phase's UI — the
prototype keeps working at every step. Each phase has an exit gate; do not start
the next phase until the gate passes.

---

## Phase 0 — Foundations (½–1 day)

Goal: local Supabase stack that mirrors reality; repo plumbing for everything after.

- `supabase init` in the repo; local stack boots (`supabase start`).
- **Tierra baseline migration** (`00000000000000_tierra_baseline.sql`): reconstruct
  the `public` schema from `tierra/tierra-app/supabase/*.sql` so local resets have
  real members/cell_groups tables. Marked already-applied on the remote
  (`supabase migration repair`) — it must never execute against production.
  Cross-check the reconstruction against the live schema via the Supabase MCP
  (`list_tables`) — the SQL files may lag production (e.g. stage labels: repo says
  'Newbie', the live app displays 'New Friends' — verify the actual CHECK values).
- Env plumbing: `.env.example` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`),
  Dockerfile build args, Dokploy environment entries (documented, not yet used).
- Create the four skills in `.claude/skills/` (migration, feature-slice,
  rls-check, design-compare) so later phases follow one procedure.

**Exit gate:** `supabase db reset` runs clean locally with Tierra tables present;
`pnpm build` unaffected; MCP `list_tables` output archived in `design/GAPS.md`
if it contradicts the baseline.

## Phase 1 — Discipleship schema + RLS + RPCs (1–2 days)

Goal: the entire data layer, provable before any UI touches it.

Migrations in order (prefix `discipleship_`, each table with its RLS in the same file):

1. `discipleship_init` — schema, enums, `settings` (engagement thresholds 14/28)
2. `discipleship_profiles` — Agapay roles (admin/discipler) on shared `auth.users`,
   `member_id → public.members`; helpers `current_member_id()`, `is_agapay_admin()`
3. `discipleship_disciple_profiles` — enrollment (member_id NOT NULL, cohort,
   enrolled_at); RLS: discipler sees rows where `members.discipler_id = current_member_id()`
4. `discipleship_master_checklists` — per-stage ordered items; admin-write
5. `discipleship_disciple_checklist_items` — instance snapshots + snapshot fn
6. `discipleship_activity_logs` — insert-only for disciplers (append-only timeline)
7. `discipleship_meetings` — + completion trigger stamping `completed_at`
8. `discipleship_milestones`
9. `discipleship_rpcs` — `promote_disciple(id, note)` (note required, audit row,
   updates `members.discipleship_stage`, resets checklist snapshot, rejects Leader),
   `reassign_disciples(ids[], to_member)`, `add_disciple(...)` (minimal member insert)
10. `discipleship_views` — `disciple_engagement` (days since last activity or
    completed meeting → healthy/cooling/at_risk from settings), `discipler_load`,
    `stage_trend` (monthly counts from stage_transitions)

Plus: local seed SQL (auth users for Alma/Josie/Gina/Rodel/Ptr. Danilo, the 43
disciples as members + enrollments, activities/meetings matching the prototype
spread), stage-label mapping tested at the boundary ('Newbie' ↔ 'New Believer').

**Exit gate (rls-check):** with seeded users — Alma cannot SELECT Josie's
disciples/logs/meetings; a discipler cannot UPDATE `public.members` directly nor
call reassign; promote without a note is rejected server-side; `supabase db reset`
+ seed clean; `supabase gen types --schema public,discipleship` compiles strict.

## Phase 2 — Auth + role shell (½–1 day)

Goal: replace the prototype's role-switcher with real login.

- Token-styled email+password login page (Supabase auth, shared accounts).
- `discipleship.profiles` role lookup → redirect: admin → `/admin`,
  discipler → `/` ; route guards on both trees; sign-out.
- Prototype role bar remains available behind a `VITE_DEMO_MODE` flag so the
  public demo keeps working while the real app grows underneath.

**Exit gate:** Alma's login lands on the queue and sees only TRIBES-assigned
disciples; Ptr. Danilo lands on `/admin`; an unauthenticated visit redirects to
`/login`; wrong-role URL access redirects correctly.

## Phase 3 — Read path: follow-up queue first (2–3 days)

Goal: real data on screen, feature by feature, per CLAUDE.md build order.

- TanStack Query + Supabase client wiring; per-feature `queryKeys.ts`;
  the seed store shrinks to demo-mode fallback.
- **Slice 1 — follow-up queue** (the hero): `disciple_engagement` view → urgency
  groups, ring, chips, empty-state celebration. Loading skeletons follow card geometry.
- Slice 2 — disciples list + profile read model (timeline = union of activity_logs,
  meetings, checklist completions, stage_transitions).
- Slice 3 — meetings list (upcoming/past).
- Slice 4 — admin reads: dashboard aggregates, disciples table, at-risk list,
  discipler load, Quest Circles (now from `public.cell_groups`, not seed).

**Exit gate:** with the local seed, every screen shows DB-derived data identical in
shape to the prototype; no stored engagement anywhere (RULES #18); Lighthouse
sanity on 375px.

## Phase 4 — Write path: mutations (2–3 days)

Goal: every prototype interaction persists.

- Log activity (10-second flow — no new required fields), optimistic queue update.
- Meetings: schedule / complete (+notes) / cancel / no-show; completion resets
  engagement via trigger; recurrence stored (materialization deferred, logged in NOTES).
- Checklist toggle (discipler-of-record + admin).
- Promote via RPC — modal already enforces the note; server enforces it again.
- Bulk reassign via RPC; selection clears; directory reflects instantly.
- Admin master-checklist CRUD + reorder (must not mutate in-progress snapshots).

**Exit gate:** each mutation round-trips (UI → DB → refetch matches optimistic
state); Tierra app still shows correct stage/discipler after promote/reassign;
append-only timeline verified (no UPDATE/DELETE grants on activity_logs).

## Phase 5 — Real analytics + PWA + polish (1–2 days)

- Stage-growth chart reads `stage_trend` view (real months, not seed history).
- Empty/error/offline states for every query; retry affordances.
- `vite-plugin-pwa`: manifest (Agapay, brand icons), installable, offline shell.
  Push notifications stay out of scope (v1 decision).
- Asia/Manila timezone audit on every displayed date/time.

**Exit gate:** `pnpm build` + Docker image green; app installs to a phone home
screen; airplane-mode reload shows the shell, not a white screen.

## Phase 6 — Production cutover (1 day + pilot window)

Goal: the shared project gets the schema; real people get the app.

1. Apply migrations to production — via `supabase db push` after linking, or a
   **Supabase branch** (MCP `create_branch` → verify → `merge_branch`) if branching
   is enabled on the plan. Never `apply_migration` straight to prod without the
   local suite green.
2. Import script: members with `discipler_id` set → enrollments; stage mapped;
   initial `stage_transitions` backfill ("Joined Agapay"); disciplers granted roles
   (anyone referenced as discipler_id, per decision).
3. Dokploy: set the two `VITE_` build args, flip `VITE_DEMO_MODE` off, deploy.
   Run `get_advisors` (security + performance) on the project and fix findings.
4. **Pilot:** TRIBES + one other circle for 1–2 weeks. Watch: queue correctness,
   engagement resets, promote audit trail, Tierra directory consistency.
5. Church-wide rollout + short discipler onboarding (the 10-second log flow is
   the habit to teach).

**Rollback:** the app is read-mostly over Tierra; disabling the Dokploy app
restores status quo. Discipleship schema is additive — leaving it dormant is safe.

## Deferred (explicitly out of v1)

Disciple logins · messaging/notifications · photo uploads · meeting recurrence
materialization · milestone editing UI · disciple self-service. Each is logged in
GAPS.md with its open questions.

## Standing verification (every phase)

- `pnpm exec tsc --noEmit && pnpm lint && pnpm build` green before any commit.
- rls-check skill after any migration touching policies.
- Screenshot pass at 375px and 1280px against the design prototype (design-compare).
- NOTES.md decision log updated; GAPS.md items closed or added.
