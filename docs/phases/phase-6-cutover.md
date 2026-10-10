# Phase 6 — Production cutover

> Elaborates ROADMAP.md "Phase 6 — Production cutover (1 day + pilot window)".
> Read alongside NOTES.md (locked decisions), design/GAPS.md (#23–32), RULES.md,
> and the Phase 0/1 specs. This document doubles as the **cutover runbook** —
> the ordered work items are the exact steps to execute on the day.
>
> **Prime directive (Tierra safety), applies to every step below:** never modify
> Tierra's `public` schema, its policies, or its data — except
> `members.discipleship_stage` / `members.discipler_id` via the Phase 1
> `security definer` RPCs, and minimal-member inserts for brand-new believers.
> The Phase 6 import is **read-only on `public.*`**: it reads `members` and
> `user_profiles`, and writes only into the `discipleship` schema.

---

## 1. Objective

After this phase the shared Supabase project (`ncijotdkovijkcpqnlbv`) carries the
`discipleship` schema in **production**, the live Tierra directory has been
back-filled into Agapay (every member with a `discipler_id` becomes an
enrolled disciple, with a mapped stage, an initial `stage_transitions` audit
row, and a discipler role granted to everyone referenced as a `discipler_id`),
and the Dokploy app at `discipleship.questlaguna.org` serves the **real**
Supabase-backed build (demo mode off) to piloting disciplers. Capability that
did not exist before: real disciplers log in on production and walk their real
disciples, with Tierra provably untouched except through the locked RPCs.

## 2. Prerequisites

All of Phases 0–5 must be **done and green**, plus a short set of live-project
confirmations, before any production change:

- **Phase 0** — `supabase init` present; `supabase/migrations/` holds the Tierra
  baseline (`00000000000000_tierra_baseline.sql`) and a documented
  `migration repair` plan so the baseline **never executes on prod**; `.mcp.json`
  points MCP at `ncijotdkovijkcpqnlbv`; `app/.env.example` lists the `VITE_` vars.
- **Phase 1** — the full `discipleship` schema, RLS, RPCs (`promote_disciple`,
  `reassign_disciples`, `add_disciple`), views (`disciple_engagement`,
  `discipler_load`, `stage_trend`), the boundary stage-mapper, `profiles` +
  `current_member_id()` / `is_agapay_admin()` helpers. `supabase db reset` + seed
  runs clean; `supabase gen types --schema public,discipleship` compiles strict;
  the rls-check scenarios pass.
- **Phase 2** — real Supabase auth + role-based redirect + route guards; the
  `VITE_DEMO_MODE` flag gates the prototype role-switcher bar.
- **Phase 3** — every read screen renders DB-derived data; no stored engagement.
- **Phase 4** — every mutation round-trips; **promote/reassign already reflect in
  the Tierra directory** through the RPCs; append-only timeline verified.
- **Phase 5** — `pnpm build` + Docker image green; PWA installs; TZ audit done.
- **Standing gate** — `pnpm exec tsc --noEmit && pnpm lint && pnpm build` green.
- **Access** — MCP tools reach the prod project; Dokploy access to the existing
  `discipleship.questlaguna.org` app; ability to read the project's publishable
  (anon) key and URL.
- **Live-schema confirmation (GAPS #32, grounding facts unverified).** Before
  finalizing the import mapping, confirm on the **live** project the actual
  stored `members.discipleship_stage` values and that `discipler_id` is populated
  — see Work item 1. Do not assume the SQL-file CHECK (`Newbie/Growing/Leader`)
  matches production; the live UI shows `New Friends`/`Schooling` variants.

## 3. Work items

Ordered. Each production-touching step is gated by the local suite being green
and by the pre-flight (item 1) having been captured.

### 3.1 — Pre-flight snapshot & live-schema confirmation (read-only, prod)

**What:** run read-only introspection against prod to (a) confirm the stage
mapping domain, (b) size the import, (c) capture a **safety baseline** of Tierra
row counts/checksums to prove the import mutated nothing.

**Files:** `supabase/scripts/preflight.sql` (new; read-only queries, kept in the
repo so the run is reproducible). Execute via MCP `execute_sql` (prod) or the SQL
editor.

```sql
-- supabase/scripts/preflight.sql  (READ-ONLY — safe to run on prod)

-- (a) Actual stored stage values + counts → defines the mapping domain (GAPS #32)
select discipleship_stage, count(*)
from public.members
where not is_archived
group by 1 order by 2 desc;

-- The exact CHECK constraint text on the live table:
select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.members'::regclass
  and conname ilike '%discipleship_stage%';

-- (b) Import sizing
select
  count(*) filter (where discipler_id is not null and not is_archived)      as disciples_to_enroll,
  count(distinct discipler_id) filter (where discipler_id is not null)      as disciplers_referenced
from public.members;

-- Disciplers WITH vs WITHOUT a Tierra auth account (roles can only be granted to those WITH one)
with referenced as (
  select distinct discipler_id as member_id
  from public.members where discipler_id is not null and not is_archived
)
select
  count(*) filter (where up.id is not null) as disciplers_with_auth,
  count(*) filter (where up.id is null)     as disciplers_without_auth
from referenced r
left join public.user_profiles up on up.member_id = r.member_id;

-- (c) Tierra SAFETY BASELINE — record these numbers; re-run after import to prove no drift.
select 'members'        as tbl, count(*) n, md5(coalesce(string_agg(id::text, ',' order by id),'')) sig from public.members
union all select 'user_profiles', count(*), md5(coalesce(string_agg(id::text, ',' order by id),'')) from public.user_profiles
union all select 'cell_groups',   count(*), md5(coalesce(string_agg(id::text, ',' order by id),'')) from public.cell_groups;

-- Column-level baseline for the two mutable Tierra columns (compare after pilot):
select id, discipleship_stage, discipler_id from public.members order by id;

-- Confirm no pre-existing `discipleship` objects collide (should be empty on a fresh prod)
select table_name from information_schema.tables where table_schema = 'discipleship' order by 1;
```

**Output:** confirmed stage domain (drives item 2's mapper), sizing numbers, the
list of disciplers missing auth accounts (drives onboarding in item 7), and the
three-table safety signature to diff against later.

### 3.2 — Author the directory-import migration (DDL only)

**What:** an idempotent, `security definer`, `public`-read-only backfill
function plus the two small boundary helpers it needs. The migration file
contains **only DDL** (function definitions) so `supabase db reset` and the merge
apply it harmlessly; the **invocation is a manual one-time step** (item 6), never
a top-level statement in the migration.

**Files:** `supabase/migrations/<YYYYMMDDHHMMSS>_discipleship_import.sql` (new,
follows the Phase 1 `discipleship_*` prefix convention).

> Column/table names below must match the **Phase 1** shapes:
> `discipleship.profiles(user_id, member_id, role)`,
> `discipleship.disciple_profiles(member_id UNIQUE, cohort, enrolled_at)`,
> `discipleship.stage_transitions(member_id, from_stage, to_stage, note, created_at)`.
> Reuse Phase 1's `discipleship.stage_from_directory(text)` boundary mapper and
> `discipleship.cohort_from_joined(date)`; the definitions below are the fallback
> if Phase 1 shipped only app-side twins (`app/src/lib/stages.ts`).

```sql
-- Boundary mapper (fallback if not already defined in Phase 1).
-- Covers every variant seen across the DB CHECK and the live UI (GAPS #27, #32).
create or replace function discipleship.stage_from_directory(p_dir text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_dir
    when 'Newbie'      then 'New Believer'
    when 'New Friends' then 'New Believer'
    when 'Growing'     then 'Growing'
    when 'Schooling'   then 'Growing'
    when 'Leader'      then 'Leader'
    -- unknown value: fail loudly rather than silently mis-stage a disciple
    else (select 1 / 0)::text
  end;
$$;

-- Default cohort from joined_date quarter (GAPS #28), e.g. 'Q2 2026'.
create or replace function discipleship.cohort_from_joined(p_joined date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_joined is null then null
    else 'Q' || extract(quarter from p_joined)::int || ' ' || extract(year from p_joined)::int
  end;
$$;

-- One-time, idempotent, read-only-on-public backfill. Returns a jsonb report.
create or replace function discipleship.import_directory_disciples(
  p_default_cohort text default null   -- null → derive per-member from joined_date
)
returns jsonb
language plpgsql
security definer
set search_path = discipleship, public
as $$
declare
  v_granted     int := 0;
  v_enrolled    int := 0;
  v_transitions int := 0;
  v_unmatched   jsonb;
begin
  -- 1) Grant the 'discipler' role to every member referenced as a discipler_id
  --    that already has a Tierra auth account (public.user_profiles.member_id).
  --    Never downgrade an existing admin.
  with referenced as (
    select distinct m.discipler_id as member_id
    from public.members m
    where m.discipler_id is not null and not m.is_archived
  ),
  matched as (
    select up.id as user_id, r.member_id
    from referenced r
    join public.user_profiles up on up.member_id = r.member_id
  )
  insert into discipleship.profiles (user_id, member_id, role)
  select user_id, member_id, 'discipler' from matched
  on conflict (user_id) do update
    set role      = case when discipleship.profiles.role = 'admin' then 'admin' else 'discipler' end,
        member_id = coalesce(discipleship.profiles.member_id, excluded.member_id);
  get diagnostics v_granted = row_count;

  -- Disciplers with no auth account yet — report only (cannot hold a role until they sign in).
  select coalesce(jsonb_agg(jsonb_build_object('member_id', r.member_id, 'name', m.name) order by m.name), '[]'::jsonb)
  into v_unmatched
  from (select distinct discipler_id as member_id
        from public.members where discipler_id is not null and not is_archived) r
  join public.members m on m.id = r.member_id
  left join public.user_profiles up on up.member_id = r.member_id
  where up.id is null;

  -- 2) Enroll every disciple (member with a discipler_id) not already enrolled.
  insert into discipleship.disciple_profiles (member_id, cohort, enrolled_at)
  select m.id,
         coalesce(p_default_cohort, discipleship.cohort_from_joined(m.joined_date)),
         now()
  from public.members m
  where m.discipler_id is not null and not m.is_archived
    and not exists (select 1 from discipleship.disciple_profiles dp where dp.member_id = m.id);
  get diagnostics v_enrolled = row_count;

  -- 3) Backfill one initial "Joined Agapay" stage_transition (NULL → mapped stage) per disciple.
  insert into discipleship.stage_transitions (member_id, from_stage, to_stage, note, created_at)
  select m.id, null, discipleship.stage_from_directory(m.discipleship_stage), 'Joined Agapay', now()
  from public.members m
  where m.discipler_id is not null and not m.is_archived
    and not exists (select 1 from discipleship.stage_transitions st where st.member_id = m.id);
  get diagnostics v_transitions = row_count;

  return jsonb_build_object(
    'disciplers_granted',           v_granted,
    'enrollments_created',          v_enrolled,
    'stage_transitions_backfilled', v_transitions,
    'disciplers_without_auth',      jsonb_array_length(v_unmatched),
    'unmatched_disciplers',         v_unmatched
  );
end;
$$;

-- Ops-only: never callable by app roles. Runs under service_role / SQL editor / MCP.
revoke all on function discipleship.import_directory_disciples(text) from public, anon, authenticated;
```

**Idempotency contract:** every insert is guarded by `NOT EXISTS` / `ON CONFLICT`,
and the `disciple_profiles.member_id` UNIQUE constraint (Phase 1) is the backstop.
A second invocation returns all-zero deltas. Because the migration is DDL only, a
local `supabase db reset` (which already seeds enrollments) just (re)defines the
function — no data drift.

### 3.3 — Apply migrations to production

Both paths require the **local suite green** (`supabase db reset` + rls-check +
`gen types`) on the exact migration set being shipped. **Never** use MCP
`apply_migration` straight to prod — it bypasses the local suite and review.

**Path A — `supabase db push` (linked CLI).** Default.

```bash
supabase link --project-ref ncijotdkovijkcpqnlbv
# Mark the Tierra baseline as already-applied so it NEVER runs on prod (prime directive):
supabase migration repair --status applied 00000000000000
supabase migration list          # confirm ONLY discipleship_* migrations are pending; baseline shows applied
supabase db push --dry-run       # inspect the exact SQL that will run — verify it touches only the discipleship schema
supabase db push                 # apply
```

**Path B — Supabase branch via MCP.** Use when branching is enabled on the plan
(`list_branches` succeeds). A branch is a separate database where migrations
auto-apply; verify there, then promote.

```
list_branches                                  → is branching available?
create_branch(name: "agapay-cutover")          → migrations auto-apply on the branch DB
   • on the branch: run the Phase 1 rls-check scenarios, get_advisors, and the item-6 import PREVIEW
merge_branch(branch_id)                         → promotes the discipleship migrations into prod
delete_branch(branch_id)                        → after a clean merge
```

**Decision:** prefer Path B when available (isolated verification before prod);
otherwise Path A. Either way the baseline must be marked applied so no Tierra DDL
re-executes.

**Verify after apply (prod):** `discipleship` schema and all Phase 1 objects
exist; re-run the item-1 safety-baseline query — the three Tierra table
signatures must be **unchanged** (schema apply must not have touched `public`).

### 3.4 — Advisors: security + performance

**What:** run MCP `get_advisors` for `type: "security"` and `type: "performance"`
(on the branch before merge in Path B, else on prod post-push) and fix findings.

Expected findings and fixes (all within the `discipleship` schema — never patch
Tierra objects to satisfy an advisor):

- **Security — function search_path mutable:** every `discipleship` function
  carries `set search_path = …` (as written above). Add to any Phase 1 function
  the advisor flags.
- **Security — RLS disabled on a table:** enable RLS on any `discipleship` table
  the advisor reports; confirm each has explicit policies (Phase 1 responsibility,
  re-verified here).
- **Security — security definer view / exposed data:** confirm `disciple_engagement`,
  `discipler_load`, `stage_trend` are `security_invoker` (or otherwise safe) and
  do not leak cross-discipler rows past RLS.
- **Performance — unindexed foreign keys:** ensure indexes exist on
  `disciple_profiles.member_id`, `stage_transitions.member_id`,
  `activity_logs.<disciple fk>`, `meetings.<disciple fk>` (mostly created in
  Phase 1; add any the advisor flags — they back the queue and import joins).
- **Performance — auth RLS initplan:** policies calling `auth.uid()` /
  `current_member_id()` per row should wrap the call as `(select auth.uid())` so
  it is evaluated once per query.

Re-run `get_advisors` until **zero ERROR-level** findings remain in the
`discipleship` schema. Log WARN-level items in NOTES.md.

### 3.5 — Grant the admin role(s)

**What:** the import grants only the `discipler` role. Grant `admin` to the
church admin account(s) explicitly (one-time). Requires the admin to have signed
in at least once (so an `auth.users` row exists).

```sql
-- Run once on prod (SQL editor / MCP execute_sql). Replace the email.
insert into discipleship.profiles (user_id, member_id, role)
select u.id, up.member_id, 'admin'
from auth.users u
left join public.user_profiles up on up.id = u.id
where u.email = '<admin-email>'
on conflict (user_id) do update set role = 'admin';
```

### 3.6 — Run the import once (prod)

**What:** invoke the item-2 function a single time against prod. Data change, not
schema — so it is **not** carried by the migration/merge; it is an explicit ops
call after the schema is live.

```sql
-- PREVIEW (Path B: run on the branch first): counts only, no writes.
--   Reuse preflight.sql sizing queries to predict the deltas.

-- APPLY (prod):
select discipleship.import_directory_disciples();          -- cohort derived per member
-- or, to force a single intake batch:
-- select discipleship.import_directory_disciples('Q2 2026');
```

Capture the returned jsonb report. Assert `enrollments_created` and
`stage_transitions_backfilled` equal `disciples_to_enroll` from item 1, and
`disciplers_granted` equals `disciplers_with_auth`. File `unmatched_disciplers`
for item 7 onboarding. **Re-run the function** — it must return all zeros
(idempotency proof). Then re-run the item-1 safety baseline: `md5` signatures for
`members` / `user_profiles` / `cell_groups` must be **byte-identical** to
pre-import (import wrote only to `discipleship`).

**Files (optional helper):** `supabase/scripts/import_report.sql` — the assert
queries above, kept for reproducibility.

### 3.7 — Dokploy: real build args, demo mode off, deploy

**What:** point the production build at prod Supabase and turn the prototype off.

1. Retrieve the client config: MCP `get_project_url` → `VITE_SUPABASE_URL`;
   MCP `get_publishable_keys` → the **publishable (anon)** key for
   `VITE_SUPABASE_ANON_KEY`. The anon key is publishable and safe to bake into the
   client bundle — **RLS is the security boundary. Never** bake `service_role`.
2. Confirm the repo-root `Dockerfile` forwards the `VITE_` vars as build args
   (Vite inlines `VITE_`-prefixed env **at build time**, so they must be `ENV`
   before `pnpm build`). Add if missing:

   ```dockerfile
   # ...after `COPY app/ ./`
   ARG VITE_SUPABASE_URL
   ARG VITE_SUPABASE_ANON_KEY
   ARG VITE_DEMO_MODE=false
   ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
       VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
       VITE_DEMO_MODE=$VITE_DEMO_MODE
   RUN pnpm build
   ```
   Also add `VITE_DEMO_MODE` to `app/.env.example` (documented default `false`).
3. In Dokploy → the `discipleship.questlaguna.org` app → Build args:
   - `VITE_SUPABASE_URL` = the prod project URL
   - `VITE_SUPABASE_ANON_KEY` = the publishable key
   - `VITE_DEMO_MODE` = `false`
   Redeploy (rebuild — build args only take effect on a fresh image).
4. **Verify:** the deployed bundle issues requests to the prod Supabase URL
   (Network tab / `grep` the URL in `dist/assets/*.js`); the prototype
   role-switcher bar is **absent**; the login screen is present; an unauth visit
   redirects to `/login`.

### 3.8 — Pilot (TRIBES + one circle, 1–2 weeks)

**What:** onboard two circles and observe. The import already back-filled the
**whole** directory; the pilot narrows *who is actively trained/using it*, not
the data scope.

- **Onboard:** TRIBES (Alma, Josie) + one more circle (e.g. CHOSEN GENERATION /
  Gina, or SOULDIERS / Rodel). Teach the **10-second log flow** — that habit
  is the pilot's single most important behavior. Send auth invites to any circle
  leader on the `unmatched_disciplers` list so they get an `auth.users` row; then
  re-run item 6 (idempotent) to grant their `discipler` role.
- **Watch (weekly), with concrete checks:**
  1. **Queue correctness** — longest-quiet-first ordering; Quiet/Cooling/Steady
     grouping matches `disciple_engagement` for the pilot disciplers.
  2. **Engagement resets** — logging an activity / completing a meeting moves the
     disciple out of the queue and resets days-since to 0 (Phase 4 trigger).
  3. **Promote audit trail** — every promotion wrote a `stage_transitions` row
     with a non-empty note; `promote_disciple` rejected note-less attempts.
  4. **Tierra directory consistency** — the item-1 column baseline
     (`members.discipleship_stage` / `discipler_id`) differs **only** for rows a
     logged promote/reassign RPC touched; every other Tierra column/table
     signature is unchanged.
  - **Observability:** MCP `get_logs` (`service: "api"`, `"postgres"`) for errors;
    weekly `get_advisors` re-run. Track a go/no-go metric: % of pilot disciplers
    who cleared their queue to zero at least once.

### 3.9 — Church-wide rollout (post-gate)

After the exit gate passes: send auth invites to the remaining referenced
disciplers, re-run item 6 (idempotent) to grant their roles, and run a short
onboarding focused on the 10-second log flow. No further schema or import change.

## 4. Interfaces & contracts

**SQL functions (created/reused in the `discipleship` schema):**

| Signature | Returns | Notes |
|---|---|---|
| `discipleship.import_directory_disciples(p_default_cohort text default null)` | `jsonb` | `security definer`, idempotent, read-only on `public.*`; revoked from `anon`/`authenticated` |
| `discipleship.stage_from_directory(p_dir text)` | `text` | immutable; maps `Newbie`/`New Friends`→`New Believer`, `Growing`/`Schooling`→`Growing`, `Leader`→`Leader`; raises on unknown |
| `discipleship.cohort_from_joined(p_joined date)` | `text` | immutable; `'Q<q> <yyyy>'` or `null` |

**Import report envelope (the function's `jsonb`):**

```jsonc
{
  "disciplers_granted": 0,            // number
  "enrollments_created": 0,           // number
  "stage_transitions_backfilled": 0,  // number
  "disciplers_without_auth": 0,       // number
  "unmatched_disciplers": [ { "member_id": "uuid", "name": "string" } ]
}
```

**Build/env contract (client bundle):**

| Var | Source | Prod value |
|---|---|---|
| `VITE_SUPABASE_URL` | MCP `get_project_url` | prod project URL |
| `VITE_SUPABASE_ANON_KEY` | MCP `get_publishable_keys` | publishable (anon) key — **never** service_role |
| `VITE_DEMO_MODE` | Dokploy build arg | `false` (string); app reads `import.meta.env.VITE_DEMO_MODE === 'true'` |

**MCP tool contracts used (no app query keys change this phase):** `list_tables`,
`execute_sql` (read-only preflight + the one import invocation), `list_migrations`,
`list_branches` / `create_branch` / `merge_branch` / `delete_branch` (Path B),
`get_advisors` (`security`, `performance`), `get_logs`, `get_project_url`,
`get_publishable_keys`. TanStack Query keys and RPC signatures used by the app are
unchanged — they were fixed in Phases 3–4.

**Files touched/created this phase:**
`supabase/migrations/<ts>_discipleship_import.sql` (new),
`supabase/scripts/preflight.sql` (new), `supabase/scripts/import_report.sql`
(new, optional), `Dockerfile` (edit — VITE_ build args),
`app/.env.example` (edit — add `VITE_DEMO_MODE`), NOTES.md (decision log).

## 5. Test plan

Runnable checks, grouped by gate. Path B runs T2–T4 and T6 on the **branch DB**
before `merge_branch`; Path A runs them locally then re-verifies on prod.

- **T1 — Local suite green (blocking prerequisite).** `supabase db reset` + seed
  clean; Phase 1 rls-check scenarios pass; `supabase gen types
  --schema public,discipleship` compiles strict; `pnpm exec tsc --noEmit && pnpm
  lint && pnpm build` green.
- **T2 — Migration is Tierra-safe.** `supabase db push --dry-run` (or the branch
  migration diff) touches **only** `discipleship` objects; grep the diff for
  `public.` — the sole allowed matches are `REFERENCES public.members` /
  `public.user_profiles` reads inside function bodies, never `ALTER`/`DROP`/`CREATE`
  on a `public` table or policy.
- **T3 — Stage mapping is total.** For every distinct value from item-1 query (a),
  `select discipleship.stage_from_directory(v)` returns a valid `Stage`; feeding a
  synthetic unknown value raises (assert the `1/0` guard fires).
- **T4 — Import idempotency & correctness.** First
  `select discipleship.import_directory_disciples()` returns
  `enrollments_created = disciples_to_enroll` and
  `disciplers_granted = disciplers_with_auth`; the **second** call returns all
  zeros; `select count(*) from discipleship.disciple_profiles` has no duplicate
  `member_id` (UNIQUE holds).
- **T5 — Tierra isolation (the safety check).** Compare the item-1 three-table
  `md5` signatures and the `members(discipleship_stage, discipler_id)` column
  baseline **before vs after** the import: byte-identical. (Import writes only to
  `discipleship`.)
- **T6 — Role grants scoped.** `select count(*) from discipleship.profiles where
  role = 'discipler'` equals `disciplers_with_auth`; no `authenticated` caller can
  execute `import_directory_disciples` (T: as a seeded discipler JWT, `select
  discipleship.import_directory_disciples()` → permission denied).
- **T7 — Advisors clean.** `get_advisors` security + performance return zero
  ERROR-level findings in the `discipleship` schema.
- **T8 — Deploy smoke.** The deployed bundle requests the prod Supabase URL; a
  pilot discipler login (Alma) lands on the queue and sees **only** her
  TRIBES-assigned disciples (server-side RLS scope); the admin login lands on
  `/admin`; unauth → `/login`; the demo role-switcher bar is absent
  (`VITE_DEMO_MODE=false`).
- **T9 — Pilot RLS in the wild.** As a piloting discipler, attempting to read
  another discipler's disciples/logs/meetings via a crafted query returns nothing
  (Phase 1 RLS on prod); a direct `update public.members` from a discipler JWT is
  denied; `promote_disciple(id, '')` (empty note) is rejected server-side.
- **T10 — End-to-end reset.** On prod, a pilot discipler logs an activity; the
  disciple leaves the queue and its `days` resets to 0 on refetch; a
  `stage_transitions` row appears on the next promotion with its note.

## 6. Exit gate

**One condition, the go/no-go for church-wide rollout:** after the pilot circles
have run on production for at least one full week, all of the following hold
simultaneously — (a) T8–T10 pass on prod (real login, correct per-discipler
queue, engagement reset, promote audit trail), (b) `get_advisors` security +
performance report **zero ERROR-level** findings, and (c) a diff of Tierra's
`public.members` / `user_profiles` / `cell_groups` against the pre-cutover
baseline shows changes **only** in `members.discipleship_stage` /
`members.discipler_id` on rows attributable to a logged `promote_disciple` /
`reassign_disciples` RPC call — no other Tierra column, table, or policy mutated.

## 7. Risks & mitigations

- **[PRIME DIRECTIVE] Accidental Tierra mutation.** The baseline migration
  re-running, or a stray `public` DDL, could corrupt the directory. *Mitigation:*
  `migration repair --status applied` on the baseline; `db push --dry-run`
  reviewed for any `public.` DDL (T2); import is read-only on `public`; the
  before/after signature diff (T5, exit-gate c) is the tripwire.
- **Stage-label drift (GAPS #32, grounding facts unverified).** Prod may store
  values the SQL files don't show. *Mitigation:* item-1 query (a) enumerates the
  real domain; `stage_from_directory` covers all known variants and **raises** on
  anything unknown (T3) rather than silently mis-staging.
- **Disciplers without auth accounts.** They cannot receive a role at import.
  *Mitigation:* the report lists them (`unmatched_disciplers`); invite → re-run
  the idempotent import (item 6). Non-blocking for pilot circles whose leaders
  are onboarded first.
- **Leaking a privileged key into the client bundle.** *Mitigation:* only the
  publishable (anon) key is used as a build arg; RLS is the boundary;
  `service_role` never appears in Dokploy build args or the repo.
- **`apply_migration` shortcut to prod.** Bypasses the local suite and review.
  *Mitigation:* forbidden — use `db push` (Path A) or the branch flow (Path B),
  both gated on T1.
- **Import run twice / partially.** *Mitigation:* fully idempotent
  (`NOT EXISTS` + UNIQUE + `ON CONFLICT`); re-run is a zero-delta no-op (T4).
- **Advisor fix touches Tierra.** *Mitigation:* only `discipleship` objects are
  patched to satisfy advisors; Tierra findings (pre-existing) are logged, not
  fixed, in this phase.
- **Realtime publication.** Do not `ALTER PUBLICATION supabase_realtime` for
  Tierra tables; add only `discipleship` tables if realtime is needed.

## 8. Rollback / safety

- **Primary rollback — disable the Dokploy app.** Agapay is read-mostly over
  Tierra; stopping the `discipleship.questlaguna.org` container takes the app
  offline and **restores the status quo instantly**. Tierra is a separate Dokploy
  app on the same project and is unaffected.
- **Schema stays safe dormant.** The `discipleship` schema is purely additive and
  isolated; leaving it in place with no client is inert. It never wrote to Tierra
  tables (import is read-only on `public`; the only Tierra writes are the audited
  `promote_disciple` / `reassign_disciples` RPCs a discipler invoked during the
  pilot — legitimate directory updates, not rolled back).
- **Full teardown (rare).** If the schema must be removed entirely,
  `drop schema discipleship cascade` removes all Agapay data with **zero** impact
  on Tierra. Do this only if the project is abandoned; the default is to leave it
  dormant.
- **Data undo during pilot.** Promotions/reassignments are append-only and
  auditable; a correction is a new `promote_disciple` / `reassign_disciples` call
  (never a manual `public.members` edit), preserving the Tierra safety invariant.
