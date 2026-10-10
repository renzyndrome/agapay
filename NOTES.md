# Agapay — build notes & decision log

## Decision log

- **2026-07-10 — Scope pivot: clickable prototype first.** Product owner asked for a
  deployable, browsable prototype before the full Supabase build. The app in `app/`
  implements all 7 design screens with in-memory seeded data (no auth, no DB);
  a prototype role-switcher bar (Discipler/Admin) replaces login, mirroring the
  design handoff's own prototype.
- **2026-07-10 — Stack:** TanStack Router SPA (created with the same generator as
  the Tierra app) + React 19 + TypeScript strict + Tailwind v4 + lucide-react, pnpm.
  This is the on-ramp to the approved TanStack Start + Supabase architecture; the
  store (`src/store.tsx`) isolates all mutations so the swap to TanStack Query +
  Supabase later is contained.
- **2026-07-10 — Design tokens** ported into Tailwind v4 `@theme`
  (`app/src/styles.css`) from `quest-laguna-tokens.css` + prototype-only semantic
  values. Components reference tokens, never raw hex. shadcn/ui skipped for the
  prototype (bespoke primitives in `src/components/ui.tsx` were faster and more
  pixel-faithful); revisit when the real build starts.
- **2026-07-10 — Seed data = real TRIBES Quest Circle members** (from the live
  Tierra deployment screenshots): Alma Mallari Estrada (cell leader) = signed-in
  discipler persona, Josie Lyn Rivera Baluyot = second discipler, 21 disciples split
  between them. Real stage distribution kept (mostly Leader, 3 Growing → the live
  app's "Schooling"); engagement days invented to exercise the queue: 2 at-risk
  under Alma, 1 under Josie (Cheska, 41d), Marilou Cabanero carries a 2-meeting
  no-show streak, Josie is >14d since her own last log → "Inactive" chip.
- **2026-07-10 — Engagement thresholds** (14/28) live in `src/lib/engagement.ts`
  only; every derivation (queue, chips, funnel, at-risk, inactive) reads from it.
- **2026-07-10 — Prototype shortcut, do not carry over:** `daysSinceLastActivity`
  is stored on the disciple object (like the design prototype). The real app must
  derive it from activity timestamps (RULES.md #18).
- **2026-07-10 — Docker:** multi-stage (node:24-alpine build → nginx:1.29-alpine),
  Dockerfile at repo root for Dokploy, SPA fallback + immutable asset caching in
  `deploy/nginx.conf`, port 80, healthcheck included.
- **2026-07-10 — Supabase integration decisions (for the next phase, already
  approved):** same Supabase project as Tierra (`ncijotdkovijkcpqnlbv`), shared
  auth.users; directory (`public.members`) owns stage + discipler_id; Agapay writes
  those back only via locked-down security-definer RPCs; new believers may be
  inserted into the directory; discipler role at import = any member referenced by
  a `discipler_id`. See `design/GAPS.md` #23–31.

- **2026-07-10 (later) — Multi-circle seed + dashboard analytics.** Added the two
  other live Quest Circles from Tierra screenshots: CHOSEN GENERATION (led by
  Gina Dimalanta Valencia, 8 members) and SOULDIERS (led by Rodel II Sarmiento
  Magbanua, 14 members) → 43 disciples, 4 disciplers, 3 circles. Gina and Rodel
  remain TRIBES disciples while discipling their own circles (multiplication).
  Dashboard now has: Quest Circle + cohort filters, stage cards with
  share-of-total bars, an Engagement health card (stacked bar + labeled legend +
  threshold note), and a per-circle breakdown card (leader, size, avg checklist,
  at-risk chip, stacked engagement bar). Admin table gained a Circle column +
  filter. Chart colors are the fixed brand status/stage tokens; palette validation
  showed CVD separation passes but gold/green need relief, so every segment ships
  with visible labels and counts (never color alone) and 2px gaps between fills.

- **2026-07-10 (v3) — Comprehensive dashboard.** Restructured into balanced rows:
  KPI tiles (disciples / need attention / meetings / avg checklist) → stage cards →
  **stage-growth line chart** (Feb–Jul, one line per stage, hover tooltip, direct
  end labels, legend; history is static seed in `STAGE_TREND_HISTORY` — real app
  derives it from stage_transitions; current month appended from live counts) →
  Quest Circles + This-week meetings → at-risk + discipler load. Growing line uses
  gold-600 (`--color-amber`) instead of gold-500 — the pill tint fails contrast as
  a 2px stroke on white.

- **2026-07-10 (v4) — Admin disciple detail modal.** Every disciple in the admin
  panel is clickable (at-risk list rows + disciples table rows) and opens a
  centered detail modal: identity header (stage/engagement/circle badges, discipler,
  cohort, last activity), attendance sparkline, and Timeline / Checklist / Meetings /
  Milestones tabs. The tab sections were extracted from the discipler profile into
  shared components (`src/components/disciple-detail.tsx`) so both surfaces render
  identically. Deep-linkable for demos: `/admin/disciples?disciple=d1`.

- **2026-07-11 — Phased execution plan authored + Phase 0-1 executed & verified.**
  `ROADMAP.md` = the 7-phase plan (0 Foundations → 6 Cutover). A background workflow
  wrote implementation-ready spec docs per phase under `docs/phases/` (+ consistency
  index). Live Tierra schema introspected read-only via Supabase MCP (project
  `ncijotdkovijkcpqnlbv`) to ground the design — **confirmed** `members.discipleship_stage`
  CHECK is `('Newbie','Growing','Leader')` (DB stores 'Newbie', Tierra UI shows
  "New Friends", Agapay shows "New Believer" → three-way boundary mapping in
  `discipleship.to_ui_stage/to_db_stage`). Live schema also carries tables absent
  from the repo SQL (financial/inventory) → repo SQL lags prod; baseline reconstructs
  only Agapay-touched tables.
- **2026-07-11 — Phase 0-1 built as real Supabase migrations** in `supabase/migrations/`:
  `20260101000000_tierra_baseline` (Agapay-touched directory subset; marked
  already-applied on remote so it never runs against prod) + ten `discipleship_*`
  migrations (schema/enums/settings, profiles+role helpers, disciple_profiles +
  append-only stage_transitions, master + instance checklists, append-only
  activity_logs, meetings + completion trigger, milestones, promote/reassign/add
  RPCs, security-invoker views). RLS lives beside each table. Model 1 enforced:
  Agapay writes `members.discipleship_stage`/`discipler_id` (and minimal-member
  inserts) ONLY through security-definer RPCs.
- **2026-07-11 — Verified by testing, NOT against production.** The droplet runs the
  live `tierra-app` + ~10 other prod containers, so no `supabase start` here; instead
  a throwaway `postgres:16` container + a faithful Supabase-auth shim
  (`test/rls/00_auth_shim.sql`: anon/authenticated/service_role roles, `auth.uid()`/
  `auth.role()` from JWT claims). `bash test/rls/run.sh` loads shim → all migrations →
  seed → **26 RLS assertions, all passing**: cross-discipler read isolation, engagement
  view respects RLS, child-table scoping, the Tierra prime directive (disciplers
  cannot write `members` directly — only via RPC), append-only activity logs,
  promote note-required + authz + directory mutation + audit + checklist re-snapshot,
  admin-only reassign that re-scopes visibility, add_disciple directory insert with
  stage mapping, RLS-enabled on every table, anon fully locked out. This is the
  Phase 1 exit gate — met. Container is torn down after the run (no leftover infra).

- **2026-07-11 — Phase docs authored by workflow + consistency-critic pass.**
  `docs/phases/phase-0..6-*.md` (implementation-ready specs) + `docs/phases/README.md`
  (index + consistency review + reconciliation directive). The seven docs were
  authored in parallel and drifted from each other; the critic caught it. **Phase 1
  as built + tested is the contract**; the directive in README resolves every blocker
  (keying = `disciple_id`; discipleship schema stores DB stage vocab; keep Phase 1's
  engagement view; RPC signatures fixed; add_disciple = admin-or-own-discipler;
  completion trigger fires on insert too; members baseline = live `members_read_auth`;
  `discipleship` exposed via `config.toml`). Docs 2–6 must be reconciled to it before
  they're built. Two live-schema facts were confirmed read-only via MCP and fixed in
  the baseline: stage CHECK `('Newbie','Growing','Leader')` and members SELECT policy
  `members_read_auth` (authenticated-only).

- **2026-07-12 — Data layer revised to PRODUCTION reality (Step 1 of the plan).**
  `.env` supplied production credentials; introspected read-only via Supabase MCP.
  The platform had evolved well past the repo's old Tierra SQL, so the schema was
  reworked and re-verified (`test/rls/run.sh` now **43/43 green**):
  - **Scoping helpers now read the directory's own RBAC.** `discipleship.profiles`
    (parallel role table) **deleted** — `public.user_profiles(id, member_id, role)`
    already holds it. `current_member_id()` reads it with no role filter;
    `is_agapay_admin()` = `role='admin'`. **A discipler is identified implicitly by
    `members.discipler_id`**, so no role grant is needed to use Agapay.
  - **Security finding (GAPS #33):** production's `is_leader_or_admin()` includes
    `'discipleship'`, and `members_update_self` allows leaders to update any member
    → that role can bypass the promote/reassign audit trail. Agapay deliberately
    does not require it; **recommend inviting disciplers as `role='member'`.**
    Pinned by an ADVISORY assertion so a future tightening is noticed.
  - **Engagement clock = personal touches only** (user decision). `Sunday Service`
    logs stay loggable + visible in the timeline but no longer reset the clock, so
    routine attendance recording can't empty the queue. `discipler_load`'s Inactive
    flag still counts all log types on purpose.
  - **Sunday sparkline now reads the directory's QR check-in module**
    (`service_types`/`service_sessions`/`attendance_records`) via new
    `discipleship.sunday_attendance()` — security definer, because that table has
    RLS enabled with no policies. Buckets the last 12 Sundays, Asia/Manila.
  - **Baseline rewritten to production parity:** real `user_profiles` role CHECK
    (admin|finance|satellite|registration|discipleship|member), production helper
    bodies verbatim, `members_read_auth`, and the three attendance tables.
  - Onboarding decision: the 41 disciplers get logins through the **existing
    `user_invitations` + Resend flow**, rolled out circle by circle.

- **2026-07-12 — Step 2 done: auth + role shell (verified against production).**
  - `src/lib/auth.ts` holds the role logic as **pure functions** (`resolveRole`,
    `landingPath`, `canAccess`, copy helpers) with **15 vitest unit tests**
    (`pnpm test`). `src/auth.tsx` is the session provider + `<RequireRole>` guard;
    `src/lib/supabase.ts` owns the client and the mode flags.
  - **Role resolution uses only tables that already exist in production**, so
    login works before the discipleship migrations are pushed: read
    `user_profiles(member_id, role)`, then count `members where discipler_id =
    member_id`. `role='admin'` → `/admin`; anyone with ≥1 assigned disciple →
    `/`; otherwise a warm `/no-access` page. No `'discipleship'` grant required
    (GAPS #33).
  - **Demo mode is the default and must stay that way for the public prototype.**
    Live auth needs BOTH Supabase env vars AND an explicit `VITE_DEMO_MODE=false`,
    so adding credentials for a later phase cannot accidentally put a login wall
    in front of discipleship.questlaguna.org. Dockerfile now takes the three
    `VITE_*` values as build args (Vite inlines them at build time); `.env.example`
    documents all of it.
  - **Verified end-to-end against production (read-only):** signed in with the
    admin account over the REST API, confirmed `user_profiles` returns exactly the
    `{id, member_id, role:'admin'}` shape the code expects, the disciple-count
    query works, authenticated reads of `members` succeed, anon reads return an
    empty set, then revoked the session (logout 204). Screenshots confirm demo
    mode renders the seeded queue unchanged and that live mode redirects `/` and
    `/admin` to the login screen when signed out.
  - **Baseline fidelity fix found by that test:** production returns `[]` to anon
    on `members` (the grant exists; `members_read_auth` filters the rows), whereas
    the baseline had dropped anon's grant and returned *permission denied*. Same
    security outcome, but the baseline + its assertion now match production.
  - **Harness bug fixed:** the suite published host port 55432, which another
    project (`cms-postgres-1`) later claimed; `docker run` then left the container
    in "Created" and all 43 checks reported garbage instead of failing loudly. The
    suite no longer publishes any port (everything goes through `docker exec`) and
    now aborts immediately with diagnostics if Postgres never becomes ready.

- **2026-07-12 — Step 3 done: the read path, one shape for both modes.**
  - New migration `20260710000012_discipleship_read_models.sql` EXTENDS (never
    breaks) Phase 1's `disciple_engagement` with life group, checklist progress,
    last-touch type and time-in-stage, and adds `disciple_timeline` (the
    append-only union the profile renders).
  - App gains TanStack Query + per-feature `queryKeys.ts` under
    `src/features/{disciples,meetings,directory,checklists}`. Every screen now
    consumes ONE domain shape (`DiscipleSummary`, `MeetingSummary`, …) that both
    the seeded store and the Supabase views map into — so demo and live render
    identical components. Screens read the SERVER-derived `engagement` key rather
    than recomputing it (RULES #18).
  - Loading skeletons follow card geometry; error states are warm, not technical.
  - **Admin "Members with no discipler" card** added (live-only; self-hides at
    zero so the demo is pixel-identical). Live count is **96** non-archived.
  - **Demo verified unchanged** by screenshotting all 7 screens after the
    refactor; the queue, dashboard, chart and circles render exactly as before.
  - **Live smoke-tested against production** (read-only, session revoked after):
    `cell_groups` + embedded `satellites` works, the unassigned-members query
    works — and it surfaced a cutover blocker (below).
  - **Harness fix #2:** `pg_isready` reports ready against Postgres's temporary
    INIT server, so loads could hit the restart window and fail while the suite
    happily ran 41 checks against a half-built schema. The probe is now a real
    `select 1` requiring two consecutive successes, and a failed load ABORTS.
- **2026-07-12 — Cutover blocker found (GAPS #39):** production PostgREST does not
  expose the `discipleship` schema (`PGRST106`). `config.toml` only covers local
  dev — the project's Settings → API → Exposed schemas must add `discipleship`
  before Step 6, or every Agapay call 404s even with migrations pushed.

- **2026-07-12 — Step 4 done: the write path.**
  - All mutations live in `src/features/mutations.ts`, each returning the SAME
    signature the seeded store used, switching internally: demo → in-memory
    store (deployed prototype untouched), live → Supabase + targeted query
    invalidation.
  - **Directory writes go only through the RPCs** (`promote_disciple`,
    `reassign_disciples`) — never a direct UPDATE on `public.members`.
  - **New migration `20260710000013_discipleship_write_support.sql`:**
    (a) `set_master_checklist(stage, texts[])` — admin-only, replaces a stage's
    list in ONE transaction, because client-side delete-then-insert could wipe a
    stage if the second call failed, and naive position swaps collide with the
    `(stage, position)` unique index; (b) a trigger stamping/clearing
    `done_at` so checklist completions reach `disciple_timeline`.
  - **Optimistic queue:** logging an activity (or completing a meeting) patches
    the cached row to `days: 0, engagement: 'green'` before the refetch lands, so
    the queue and ring move instantly (RULES #15). Sunday Service deliberately
    does NOT patch — it never resets the clock.
  - **Verification.** RLS suite grew to **56 assertions** with 13 new write-path
    proofs: a discipler CAN log/schedule for their own disciple and CANNOT for
    anyone else's, `created_by` cannot be forged, completing a meeting stamps
    `completed_at`, ticking stamps `done_at` and un-ticking clears it, master
    edits are admin-only, and a master rewrite leaves in-progress instances
    untouched (RULES #20). Plus **5 new component tests** (`mutations.test.tsx`,
    jsdom + real providers) proving the demo path still works end-to-end:
    log → queue clears, warm toast names the disciple, meeting completion resets,
    promotion refused without a note then accepted with one, checklist toggle
    updates progress. Demo screenshots are byte-identical to pre-Step-4.
  - Not yet wired: `add_disciple` has an RPC + tests but no UI (GAPS #14), and
    meeting recurrence is stored but not materialised (GAPS #8).

- **2026-07-12 — Step 5 done: real analytics, PWA, polish.**
  - `stage_trend(months)` (migration 14) replays `stage_transitions` into
    end-of-month snapshots. SECURITY INVOKER so RLS applies — a discipler sees
    only their own trend, admin sees all — which keeps the same access model as
    the other read views (consistency finding C8: no revoke, no definer-only RPC).
    The chart component now renders a plain series; demo still appends a live
    current month so promoting someone visibly moves the line.
  - **PWA**: `vite-plugin-pwa` (autoUpdate), manifest "Agapay — Quest Laguna",
    real brand icons generated from `logo-mark.png` (192/512/maskable/apple-touch,
    cream-padded). Fonts are cache-first; **Supabase responses are never cached**
    — a stale queue would be worse than no queue. Push notifications stay out of
    scope. Verified: manifest, `sw.js` and icons all serve 200.
  - Offline banner in the root shell ("showing the last synced information").
  - Demo screenshots remain byte-identical through Steps 3–5 (89 446 bytes).
- **2026-07-12 — Step 6 PREPARED, not executed.**
  - `scripts/import-disciples.ts`: dry-run by default, `--apply` to write.
    Idempotent (skips already-enrolled), writes ONLY to the `discipleship`
    schema, derives cohort from `joined_date`, backfills a "Joined Agapay"
    transition and a checklist snapshot per member.
  - **Dry run executed against production (read-only): 174 directory members
    have a `discipler_id`** and would be enrolled. It then stopped at the known
    blocker and prints the exact fix.
  - `docs/CUTOVER.md` — the full runbook: push (with `migration repair` so the
    Tierra baseline never executes), expose the schema, seed master checklists,
    import, Dokploy env, invite pilot disciplers as `role='member'`, verify,
    pilot, and a rollback table.
  - **Not executed on purpose:** `supabase db push` and `--apply` change a live
    database serving the congregation, and the API-exposure step can only be done
    by the project owner in the dashboard. Both await your go-ahead.

- **2026-07-12 — PRODUCTION CUTOVER (partial): schema + import are live.**
  - All 15 migrations applied to `ncijotdkovijkcpqnlbv` (8 tables all with RLS,
    15 policies, 4 views, 15 functions). History clean under our version numbers.
  - Hiccups worth remembering: `config.toml` said Postgres 16, prod is **17.6**
    (CLI rejects 16); local history lacked Tierra's 16 migrations, fixed with
    documented **no-op placeholder files** rather than marking their real
    migrations reverted; `service_role` had no grant on the new schema (added in
    migration 15) so the import failed until fixed.
  - **Master checklists seeded** (New Believer 6 / Growing 5 / Leader 4, from the
    design handoff). Editable in the admin Checklists screen; because snapshots
    are deliberately frozen (RULES #20), `scripts/resnapshot-checklists.ts` is
    the explicit opt-in way to push later edits to already-enrolled disciples.
  - **174 disciples imported** (99 Growing, 35 Newbie, 40 Leader; 42 disciplers),
    with audit rows + 865 checklist items. **Proved the directory was untouched:**
    an md5 fingerprint over every member's id/name/stage/discipler/updated_at is
    IDENTICAL before and after (`cd24c4e3d5bcd5e5e54bd4a2dffbdf44`), as are all
    other public table counts.
  - Expected-but-surprising on day one: **everyone reads at-risk** (engagement is
    derived from logged activity and there is none yet), and **cohorts are empty**
    because 267 of 271 members have no `joined_date`.
- **2026-07-12 — Discipler login chain: the missing link.** `handle_new_user()`
  creates `user_profiles (id, role)` with **member_id NULL**, so an invited
  discipler would hit the no-access screen. **Decision: the directory admin app
  does the linking** (`/admin/users` → `linkAccountToMember`, already built and
  1:1-enforced), so Agapay's write boundary stays at the two `members` columns.
  **Decision: the church collects the 11 missing discipler emails**; rollout
  starts with the 31 reachable ones. The discipler with 10 disciples is most
  urgent. Disciples themselves never log in (v1 scope).

- **2026-09-27 — Add a disciple: directory search + link (GAPS #14, part).**
  Disciples tab → **Add** opens a sheet that searches the church directory
  first: plain name matches, then suggestions (same initials "JC" → "Juan
  Carlos …", same surname, look-alike spelling) from `src/lib/memberMatch.ts`,
  the same rules as the directory app's staff check-in search. A member with
  no discipler gets **Add** → new RPC `link_disciple(member)` (sets
  `discipler_id` to the caller, enrolls: profile + "Joined Agapay" transition +
  checklist snapshot; idempotent; refuses members who already walk with
  someone, the caller's own record, loops up the discipling line, archived
  members). **Add new believer** only after the search, with a similar-names
  warning before `add_disciple`. Search reads only name, stage, satellite and
  discipler (no contact details). Rules only, no Jev (browser app, no server
  to hold a key).
  **Security fix in the same migration** (`20260927064701`, applied to prod):
  `add_disciple`'s guard was NULL-unsafe (`not (false or null)` never raised)
  and anon held EXECUTE, so the public anon key could insert directory
  members. Now: signed-in discipler for themselves or an admin, name required,
  missing city stored as `''` (NOT NULL in prod); EXECUTE on every write RPC
  revoked from PUBLIC and anon. Verified unused before the fix (0 "Joined
  Agapay" rows). RLS suite section O (21 checks). Rollback file in
  `supabase/rollbacks/`. Also added the placeholder for the directory app's
  `20260926164908_checkin_email`.

## Batched questions for the design/product lead

1. "At-risk" naming: home chip counts red-only, admin list counts amber+red —
   rename the admin list to "Needs attention"? (GAPS #12)
2. Stage labels: design says New Believer/Growing/Leader; Tierra DB stores
   Newbie; live Tierra UI shows New Friends/Schooling. Confirm Agapay display
   labels are final. (GAPS #27, #32)
3. Sunday attendance sparkline is derived from logged "Sunday Service" activities —
   acceptable, or does attendance need its own capture? (GAPS #6)
4. Milestones have no add/achieve UI in the design — who marks them, and is the
   milestone list fixed? (GAPS #7)
5. Meeting recurrence semantics (materialize future occurrences vs. reminder-only)?
   (GAPS #8)
6. Should the no-show streak surface in the queue blurb (e.g. "2 no-shows in a
   row — maybe try a different day")? Seed data supports it. (GAPS #9)

## How to run

- Dev: `cd app && pnpm install && pnpm dev` (port 3000)
- Prod check: `pnpm build && pnpm preview`
- Docker: `docker build -t agapay-prototype . && docker run -p 3002:80 agapay-prototype`
- Dokploy: point the app at this repo, build type Dockerfile (root `Dockerfile`),
  container port 80.
