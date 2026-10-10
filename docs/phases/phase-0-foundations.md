# Phase 0 — Foundations

> Elaborates ROADMAP.md → "Phase 0 — Foundations". Read alongside `NOTES.md`
> (locked decisions), `design/GAPS.md` (#23–32 Tierra integration), `RULES.md`
> (engineering rules #17–23), and `CLAUDE.md` (domain vocabulary).
>
> **Prime directive (all phases):** never modify Tierra's `public` schema,
> policies, or data — except `members.discipleship_stage` / `members.discipler_id`
> via `security definer` RPCs, and minimal-member inserts for brand-new believers.
> Phase 0 writes **zero** Tierra data and creates **zero** Tierra objects on the
> shared remote; its only remote action is a metadata-only migration-history repair.

---

## 1. Objective

After Phase 0 the repo has a **local Supabase stack that mirrors the shared
production project** (`ncijotdkovijkcpqnlbv`): `supabase db reset` rebuilds the five
Tierra `public` tables Agapay reads (`members`, `satellites`, `user_profiles`,
`cell_groups`, `member_cell_groups`) with the live-verified schema, constraints, and
RLS, so every later phase develops against real shapes instead of the in-memory seed.
It also lands the repo plumbing everything else depends on — env variables wired from
`.env.example` through Dockerfile build args to Dokploy, and the four procedure skills
(`migration`, `feature-slice`, `rls-check`, `design-compare`) — while the deployed
clickable prototype at `discipleship.questlaguna.org` keeps running untouched.

## 2. Prerequisites

- **Prior phases:** none — Phase 0 is the first phase.
- **Artifacts that must already exist (all present, verified):**
  - `app/` prototype builds green (`pnpm build`) — the on-ramp we must not regress.
  - `.mcp.json` at repo root pointing the Supabase MCP at `project_ref=ncijotdkovijkcpqnlbv`
    (copied from Tierra per GAPS #31; git-ignored). Enables `list_tables` cross-check.
  - Tierra source SQL reachable at
    `/home/renzycode/projects/quest/tierra/tierra-app/supabase/{schema.sql,add-member-fields.sql,add-cell-group-banner.sql}`
    — the reconstruction inputs (treated as *lagging* references; live schema wins).
- **Tooling:** Supabase CLI ≥ 1.200, Docker (for `supabase start`), `pnpm@10.23.0`
  (pinned in the Dockerfile), Node 24.
- **Locked decisions acknowledged (NOTES.md 2026-07-10):** Model 1 (directory owns
  stage + `discipler_id`); shared `auth.users`; all Agapay objects live in a dedicated
  `discipleship` schema (Phase 1); Tierra writes only via locked-down RPCs (Phase 1).

## 3. Work items

### 3.1 — Initialize the local Supabase stack

**Build:** run `supabase init` at the repo root (`agapay/`), creating `supabase/`.
Do **not** enable the sample `seed.sql` run of any prototype data yet (seed is Phase 1).

**Files created:**
- `supabase/config.toml` — keep defaults; confirm `[db] major_version = 15`
  (Supabase local default; production `ncijotdkovijkcpqnlbv` is PG 15/17-compatible —
  no version-specific DDL is used, so 15 is safe). Set `project_id = "agapay"`.
- `supabase/.gitignore`, `supabase/migrations/` (empty), `supabase/seed.sql` (empty
  placeholder — Phase 1 fills it).

**Verify:** `supabase start` brings up containers healthy; `supabase status` prints
`API URL` (`http://127.0.0.1:54321`) and `anon key` — the two values a developer copies
into `app/.env.local` (see 3.4). `supabase stop` cleanly tears down.

**Repo `.gitignore` addition** (root): ignore `supabase/.temp/` and any
`supabase/.branches/`; keep `supabase/migrations/` and `supabase/config.toml` tracked.

---

### 3.2 — Tierra baseline migration (reconstruct the five tables Agapay touches)

**Build:** author one genesis migration that reconstructs **only** the Tierra objects
Agapay reads. Scope is deliberately partial — `members`, `satellites`, `user_profiles`,
`cell_groups`, `member_cell_groups`, their FKs, the `handle_new_user` /
`update_updated_at` triggers, and their RLS. `ministries`, `member_ministries`,
`fun_facts`, `financial_transactions`, `inventory_*`, and the dropped `events` feature
are **excluded** — none of the five FK to them, so the subset is self-contained.

**File:** `supabase/migrations/00000000000000_tierra_baseline.sql`
(version `00000000000000` sorts before every remote migration → genesis; it is the row
we mark applied so `db push` never runs it on prod).

**Authoritative source = live introspection, not the SQL files.** The `.sql` files lag
production. Reconstruct to match `list_tables` output (archived in `design/GAPS.md`):
- `members.discipleship_stage` CHECK is **`('Newbie','Growing','Leader')`** on live —
  matches `schema.sql`. The 'New Friends'/'Schooling' labels are **Tierra frontend
  display only**, never stored. (Resolves GAPS #27/#32.)
- `members.facebook_url text` exists **on live but in no repo `.sql` file** → include it.
- `cell_groups.banner_url text` (from `add-cell-group-banner.sql`) → include it.
- `members` includes all `add-member-fields.sql` columns (`discipler_id`,
  `leadership_level`, `follow_through`, `discipleship_journey`, `member_category`, …).

**DDL sketch (faithful to live; abbreviated indexes):**

```sql
-- 00000000000000_tierra_baseline.sql
-- Tierra directory baseline — LOCAL DEV ONLY. Marked already-applied on prod
-- (supabase migration repair). Reconstructs only the tables Agapay reads.
-- DO NOT add Agapay objects here; those live in the `discipleship` schema (Phase 1).

create extension if not exists "uuid-ossp" with schema extensions;  -- live: extensions.uuid_generate_v4()

-- SATELLITES ---------------------------------------------------------------
create table public.satellites (
  id uuid primary key default extensions.uuid_generate_v4(),
  name text not null unique,
  description text, address text,
  pastor_id uuid,                       -- FK added after members exists
  contact_email text, contact_phone text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- MEMBERS (identity + directory-owned discipleship fields) -----------------
create table public.members (
  id uuid primary key default extensions.uuid_generate_v4(),
  name text not null,
  email text unique, phone text,
  age integer check (age > 0 and age < 120),
  birthday date,
  gender text check (gender in ('male','female')),
  city text not null, address text,
  satellite_id uuid references public.satellites(id) on delete set null,
  discipleship_stage text not null check (discipleship_stage in ('Newbie','Growing','Leader')),
  membership_status text not null default 'active'
    check (membership_status in ('visitor','regular','active','inactive')),
  joined_date date,
  photo_url text, bio text, spiritual_description text, prayer_needs text,
  spiritual_score double precision check (spiritual_score >= 1 and spiritual_score <= 10),
  spiritual_sentiment text check (spiritual_sentiment in ('struggling','stable','thriving')),
  needs_support boolean default false,
  emergency_contact_name text, emergency_contact_phone text,
  is_archived boolean default false,
  civil_status text check (civil_status in ('single','married','widowed')),
  spouse_name text, wedding_anniversary date,
  num_children integer check (num_children >= 0),
  member_category text check (member_category in ('Kid','Student','Young Pro','Mother','Father')),
  discipler_id uuid references public.members(id) on delete set null,  -- member→member
  follow_through text check (follow_through in
    ('Salvation','Prayer','Bible and Devotion','Transformation','Cell and Church')),
  discipleship_journey text check (discipleship_journey in
    ('Consolidations','Pre Encounter','Encounter','Post-Encounter','SOD1','SOD2','SOD3',
     'QBS Theology 101','QBS Preaching 101')),
  leadership_level text default 'Member' check (leadership_level in
    ('Member','Disciple Maker','Eagle','Pastor','Head Pastor')),
  spiritual_name text,
  is_vision_keeper boolean default false,
  is_full_time boolean default false,
  community text,
  facebook_url text,                    -- live-only drift; not in any repo .sql
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_members_discipler on public.members(discipler_id);
create index idx_members_stage     on public.members(discipleship_stage);
create index idx_members_archived  on public.members(is_archived) where is_archived = false;
create index idx_members_name      on public.members(name);

alter table public.satellites
  add constraint fk_satellites_pastor foreign key (pastor_id)
  references public.members(id) on delete set null;

-- USER PROFILES (shared auth.users → member) -------------------------------
create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  role text not null default 'member'
    check (role in ('super_admin','satellite_leader','cell_leader','member')),
  satellite_id uuid references public.satellites(id) on delete set null,
  is_active boolean default true,
  last_login_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- CELL GROUPS (Quest Circles) ----------------------------------------------
create table public.cell_groups (
  id uuid primary key default extensions.uuid_generate_v4(),
  name text not null, description text,
  satellite_id uuid references public.satellites(id) on delete cascade,
  leader_id uuid references public.members(id) on delete set null,
  co_leader_id uuid references public.members(id) on delete set null,
  meeting_day text check (meeting_day in
    ('Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday')),
  meeting_time time, meeting_location text,
  is_active boolean default true,
  max_members integer default 15,
  banner_url text,                      -- from add-cell-group-banner.sql
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- MEMBER ↔ CELL GROUP junction ---------------------------------------------
create table public.member_cell_groups (
  id uuid primary key default extensions.uuid_generate_v4(),
  member_id uuid references public.members(id) on delete cascade,
  cell_group_id uuid references public.cell_groups(id) on delete cascade,
  role text not null default 'member' check (role in ('leader','co_leader','member')),
  joined_at timestamptz default now(),
  left_at timestamptz,
  is_active boolean default true,
  unique (member_id, cell_group_id)
);

-- TRIGGERS / FUNCTIONS (faithful to live) ----------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_profiles (id, role) values (new.id, 'member');
  return new;
end; $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger update_members_updated_at   before update on public.members     for each row execute function public.update_updated_at();
create trigger update_satellites_updated_at before update on public.satellites  for each row execute function public.update_updated_at();
create trigger update_cell_groups_updated_at before update on public.cell_groups for each row execute function public.update_updated_at();
create trigger update_user_profiles_updated_at before update on public.user_profiles for each row execute function public.update_updated_at();

-- RLS (faithful to live — Agapay's read path depends on members_read_public) -
alter table public.satellites          enable row level security;
alter table public.members             enable row level security;
alter table public.user_profiles       enable row level security;
alter table public.cell_groups         enable row level security;
alter table public.member_cell_groups  enable row level security;

create policy "members_read_public" on public.members
  for select using (not is_archived);                        -- anon+auth read (GAPS #25)
create policy "members_insert_admin" on public.members
  for insert with check (auth.role() = 'authenticated' and exists (
    select 1 from public.user_profiles where id = auth.uid()
      and role in ('super_admin','satellite_leader')));
create policy "members_update_self" on public.members
  for update using (auth.role() = 'authenticated' and (
    exists (select 1 from public.user_profiles where id = auth.uid() and member_id = members.id)
    or exists (select 1 from public.user_profiles where id = auth.uid()
               and role in ('super_admin','satellite_leader'))));

create policy "satellites_read_all" on public.satellites for select using (true);
create policy "cell_groups_read_auth" on public.cell_groups
  for select using (auth.role() = 'authenticated');
create policy "mcg_read_auth" on public.member_cell_groups
  for select using (auth.role() = 'authenticated');
create policy "user_profiles_read_own" on public.user_profiles
  for select using (auth.uid() = id);
create policy "user_profiles_read_admin" on public.user_profiles
  for select using (exists (select 1 from public.user_profiles up
    where up.id = auth.uid() and up.role = 'super_admin'));
-- (write policies for satellites/cell_groups/user_profiles ported verbatim from
--  tierra schema.sql for fidelity; Agapay never exercises them locally.)
```

> **Why faithful RLS matters:** Phase 1's `rls-check` and Phase 3's read path assume
> `members_read_public` returns non-archived rows to the anon key and that a plain
> discipler (Tierra role `cell_leader`/`member`) **cannot** UPDATE `public.members`
> except their own linked row. Reproducing these policies locally is what makes the
> RLS tests meaningful before prod.

**Excluded from the baseline (documented, intentional):** realtime publication lines,
storage buckets, and the six non-Agapay tables. If a later phase needs one, extend the
baseline in a follow-up migration — never widen this genesis file after it is repaired.

---

### 3.3 — Mark the baseline already-applied on the shared remote (metadata only)

**Build:** guarantee the genesis migration can **never execute against production**.

**Procedure (one-time, safe — writes only to `supabase_migrations.schema_migrations`):**
```bash
supabase link --project-ref ncijotdkovijkcpqnlbv          # read-only link
supabase migration list                                   # inspect divergence first
supabase migration repair --status applied 00000000000000 # insert genesis into remote history
supabase migration list                                   # confirm 00000000000000 = applied
```
`migration repair` inserts a single history row; it runs **no DDL** and touches **no
Tierra table, policy, or datum**. After this, a future `supabase db push` (Phase 6)
compares local vs remote history, sees `00000000000000` applied, and skips it — only
new `discipleship_*` migrations get pushed.

**Known divergence to reconcile (do not push in Phase 0):** remote history already
contains three Tierra CLI migrations absent from this repo —
`20260710030842_drop_events_feature`, `20260710030858_production_security_hardening`,
`20260710031019_revoke_anon_execute_on_definer_helpers`. Because their versions sort
**after** `00000000000000` and **before** any Phase-1 `discipleship_*` timestamp, they
do not block a later scoped push. Record them; never run `db push --include-all`.

---

### 3.4 — Env plumbing

**Build:** wire `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from a documented
example → Vite build → Docker → Dokploy. The anon key is the **public, RLS-protected
client key** — safe to inline in the SPA bundle. The `service_role` key must never
appear in `.env.example`, the Dockerfile, or Dokploy build args.

**File: `app/.env.example`** (Vite's `envDir` is the app root; tracked because
`app/.gitignore` ignores only `.env`, not `.env.example`):
```dotenv
# Copy to app/.env.local for local dev. Local values come from `supabase status`.
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon key from `supabase status`>
```

**File: `Dockerfile`** — add build args in the build stage so Vite inlines them at
`pnpm build` (a static SPA has no runtime env; these MUST be build-time args):
```dockerfile
FROM node:24-alpine AS build
WORKDIR /build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate
COPY app/package.json app/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY app/ ./
RUN pnpm build
# ...unchanged nginx stage...
```

**Dokploy (documented, not yet applied — flipped on in Phase 6):** under the app's
**Build Args** (not runtime env), add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
= the production project's URL + anon key. Note in NOTES.md that the prototype currently
needs neither (no DB calls until Phase 3); Phase 6 sets them and flips `VITE_DEMO_MODE`
off.

**Do not** add a Supabase client or read these vars in code yet — that is Phase 3.
Phase 0 only establishes the pipe. `pnpm build` must stay green with the vars absent.

---

### 3.5 — Author the four procedure skills

**Build:** create Claude Code skills so every later phase follows one written procedure.
Each is a directory with a `SKILL.md` carrying YAML frontmatter (`name`, `description`)
plus a numbered procedure. Content is derived from RULES.md and ROADMAP's exit gates.

**Files:**
- `.claude/skills/migration/SKILL.md` — **authoring a `discipleship_*` migration.**
  Procedure: `supabase migration new discipleship_<slug>`; put the table **and its RLS
  in the same file** (ROADMAP Phase 1 convention); all Agapay objects in schema
  `discipleship`, never `public`; Tierra writes only through `security definer` RPCs;
  `supabase db reset` to apply locally; regenerate types (3.6 command); run the
  `rls-check` skill; update NOTES.md decision log + close/open GAPS items. Prime
  directive banner: no `DROP`/`ALTER` against Tierra objects.
- `.claude/skills/feature-slice/SKILL.md` — **building a vertical feature slice** under
  `app/src/features/<feature>/` (the convention Phase 3 introduces): `queryKeys.ts`
  (typed key factory), `api.ts` (Supabase queries returning the `ApiResponse<T>`
  envelope), `hooks.ts` (TanStack Query), `components/`. Many small files (<400 lines);
  engagement/queue/checklist %/funnel always **derived**, never stored (RULES #18);
  loading skeletons follow card geometry; end with `design-compare`.
- `.claude/skills/rls-check/SKILL.md` — **proving RLS before UI trusts it.** Procedure:
  seed auth users + linked members; for each persona open a supabase-js client with the
  **anon key** and that user's JWT; run the scenario matrix (§5); assert allow/deny by
  row count / error code (`42501` = RLS denial); a plain discipler must not UPDATE
  `public.members` nor call reassign; `promote_disciple` with an empty note must be
  rejected server-side. Fails the build on any mismatch.
- `.claude/skills/design-compare/SKILL.md` — **visual parity check.** Procedure:
  screenshot each changed screen at **375px and 1280px**; diff against
  `design/design_handoff_agapay/design_files/Agapay App.dc.html`; assert tokens only
  (no raw hex — RULES #23), fixed status/stage tints, Poppins/Manrope only, warm
  no-guilt copy, no emoji. Log deltas in `design/GAPS.md`.

Frontmatter contract (all four): `name: <skill-name>` (kebab-case, matches dir),
`description: <one line stating when to invoke>`.

---

### 3.6 — Establish the type-generation contract

**Build:** document (and smoke-test) the command that produces the app's DB types, so
Phase 1 can extend it to `discipleship`. In Phase 0 only `public` exists locally.

**Command (target path is the contract):**
```bash
supabase gen types typescript --local --schema public > app/src/lib/database.types.ts
```
Phase 1 changes `--schema public` → `--schema public,discipleship`. Add a `pnpm`
script alias in a comment for later (`"gen:types"`), but wiring it into `app/package.json`
is optional in Phase 0 (no `discipleship` schema to type yet). The generated file must
compile under the app's strict `tsconfig` (`pnpm exec tsc --noEmit`).

## 4. Interfaces & contracts

Phase 0 creates **no** application query keys or RPCs (those begin in Phase 1). It locks
the conventions and boundary contracts everything later depends on:

- **Migration file contract:** `supabase/migrations/<version>_<name>.sql`; genesis =
  `00000000000000_tierra_baseline.sql`; `discipleship_*` migrations carry table + RLS in
  one file (ROADMAP Phase 1).
- **Env contract:** exactly two public vars — `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` — consumed via `import.meta.env` (Phase 3) and injected as
  Docker build args. No `service_role` key anywhere client-side.
- **Generated types contract:** `app/src/lib/database.types.ts` from
  `supabase gen types typescript --local --schema public[,discipleship]`.
- **Stage-label boundary mapping (locked here, implemented at the data boundary in
  Phase 1/3):** DB stores `'Newbie' | 'Growing' | 'Leader'`; UI (`app/src/lib/stages.ts`,
  `type Stage`) shows `'New Believer' | 'Growing' | 'Leader'`. Mapping is total and
  bijective: `Newbie ↔ New Believer`, `Growing ↔ Growing`, `Leader ↔ Leader`. "Newbie"
  and the Tierra display strings 'New Friends'/'Schooling' are **never** shown in Agapay.
- **API envelope (mandated by the `feature-slice` skill, per patterns.md):**
  `interface ApiResponse<T> { success: boolean; data?: T; error?: string;
  meta?: { total: number; page: number; limit: number } }`.
- **Query-key factory shape (mandated by `feature-slice`, built in Phase 3):**
  per-feature `queryKeys.ts` exporting a `const` factory, e.g.
  `queue: { all: ['queue'] as const, byDiscipler: (id: string) => ['queue', id] as const }`.
- **Skill frontmatter contract:** `name` (kebab-case = directory) + one-line
  `description`, for all four skills.

## 5. Test plan

All checks are runnable from the repo root unless noted. Phase 0 is green when every
check below passes.

**Stack + baseline (integration):**
1. `supabase start` → all containers report healthy (`supabase status` exits 0).
2. `supabase db reset` → exits 0 with the genesis migration applied, no errors.
3. Tables present:
   `psql "$(supabase status -o env | grep DB_URL)" -c "\dt public.*"` lists exactly
   `members, satellites, user_profiles, cell_groups, member_cell_groups`
   (and no `ministries`/`events`/`inventory_*`).
4. **Stage CHECK equals live** (regression guard on the resolved GAPS #27/#32):
   ```sql
   select pg_get_constraintdef(oid) from pg_constraint
   where conrelid = 'public.members'::regclass and conname like '%discipleship_stage%';
   -- expect: CHECK (discipleship_stage = ANY (ARRAY['Newbie','Growing','Leader']))
   ```
5. **`facebook_url` present** (drift captured):
   `select column_name from information_schema.columns where table_name='members'
   and column_name='facebook_url';` → 1 row.
6. **`members_read_public` works for anon:** using the local anon key, an unauthenticated
   `select` on `members` returns only `is_archived = false` rows (0 rows on empty DB is a
   pass; the policy's existence is asserted via `pg_policies`).

**App unaffected (unit/build):**
7. `cd app && pnpm install --frozen-lockfile && pnpm exec tsc --noEmit && pnpm lint && pnpm build`
   — all green; bundle builds with the two `VITE_` vars **absent** (no runtime coupling yet).
8. `pnpm test` (Vitest) green — no existing test regresses (engagement/derive utils).

**Type generation (contract):**
9. `supabase gen types typescript --local --schema public > /tmp/db.types.ts &&
   pnpm exec tsc --noEmit /tmp/db.types.ts` → compiles; the generated `members` row type
   includes `discipleship_stage: "Newbie" | "Growing" | "Leader"` and `facebook_url`.

**Skills present (structure):**
10. `.claude/skills/{migration,feature-slice,rls-check,design-compare}/SKILL.md` all exist
    with valid frontmatter (`name` matching the directory + a `description`).

**Remote safety (metadata only):**
11. `supabase migration list` shows local `00000000000000` and, after 3.3,
    remote history includes `00000000000000` marked applied — confirming a future push
    will skip the baseline. No Tierra table row count changes (`select count(*) from
    public.members` on remote is unchanged before/after repair).

**Cross-check archived:**
12. The `list_tables` introspection (stage CHECK = `Newbie/Growing/Leader`;
    `members.facebook_url` and `cell_groups.banner_url` drift) is written into
    `design/GAPS.md` under GAPS #30/#32 as the authoritative baseline reference.

**rls-check scenario matrix (skill authored in Phase 0; first *executed* in Phase 1
after seed exists — recorded here so the skill ships with concrete scenarios):**

| # | Signed-in persona (role)            | Query                                                         | Expected |
|---|-------------------------------------|--------------------------------------------------------------|----------|
| 1 | Alma (discipler, `cell_leader`)    | `select` her own assigned disciples' rows                    | **allow** |
| 2 | Alma                               | `select` Josie's disciples / activity_logs / meetings         | **deny** (0 rows) |
| 3 | Alma                               | `update public.members set discipleship_stage=...` on a disciple | **deny** (`42501`) |
| 4 | Alma                               | `rpc('reassign_disciples', ...)`                             | **deny** (not admin) |
| 5 | Alma                               | `rpc('promote_disciple', {note: ''})`                       | **deny** (note required, server-side) |
| 6 | Ptr. Danilo (admin)                 | `select` any circle's disciples                              | **allow** |
| 7 | Ptr. Danilo (admin)                 | `rpc('reassign_disciples', ...)` then `rpc('promote_disciple', {note:'ready'})` | **allow** |
| 8 | anon (no JWT)                       | `select` on `public.members`                                 | **allow** non-archived only (Tierra `members_read_public`) |

> Scenarios 1–7 exercise `discipleship`-schema objects created in Phase 1; scenario 8 is
> testable in Phase 0 against the baseline. The table is the `rls-check` skill's template.

## 6. Exit gate

**Single testable condition:** `supabase db reset` completes clean locally with all five
Tierra tables (`members`, `satellites`, `user_profiles`, `cell_groups`,
`member_cell_groups`) present and the `members.discipleship_stage` CHECK equal to the
live-verified `('Newbie','Growing','Leader')`, **and** `cd app && pnpm build` stays green,
**and** the `list_tables` cross-check (including the `facebook_url` drift) is archived in
`design/GAPS.md`. Do not start Phase 1 until this passes.

## 7. Risks & mitigations

- **[Prime directive] Baseline accidentally executes against production.** *Mitigation:*
  version `00000000000000` sorts first and is marked **applied** on remote via
  `migration repair` (3.3) before any push; a scoped `db push` (never `--include-all`,
  never `apply_migration` straight to prod) then skips it; the file contains only plain
  `CREATE` statements, so even if run it would error on Tierra's existing objects rather
  than mutate them — repair removes even that possibility. Phase 0 issues **no** DDL to
  the remote.
- **Live/repo schema drift (`facebook_url`, `banner_url`, future columns).**
  *Mitigation:* reconstruct from live `list_tables`, not the lagging `.sql` files;
  re-run the MCP cross-check each phase and archive deltas in `design/GAPS.md`.
- **Stage-label ambiguity (Newbie / New Friends / Schooling).** *Resolved by
  introspection:* the DB stores only `Newbie/Growing/Leader`; the other strings are
  Tierra-frontend display. Agapay maps `Newbie ↔ New Believer` at the boundary and never
  shows "Newbie".
- **Remote migration-history divergence** (3 Tierra CLI migrations absent locally).
  *Mitigation:* `supabase migration list` before any push; the Tierra versions sort
  between the genesis and Phase-1 timestamps, so a scoped push is unaffected; reconcile
  (pull or record) but never force-include.
- **Partial baseline breaks a later local query** that references an excluded table.
  *Mitigation:* Agapay reads only the five; if a real need appears, add a follow-up
  migration rather than editing the repaired genesis file.
- **Anon key leakage confusion.** *Mitigation:* only the public anon key is ever inlined
  (RLS-protected by design); `.env.example` and Dockerfile explicitly exclude
  `service_role`; documented in NOTES.md.
- **Local PG version vs prod.** *Mitigation:* no version-specific DDL is used; keep
  `config.toml major_version = 15`; the type-gen + `db reset` checks catch incompatibility.

## 8. Rollback / safety

Phase 0 is almost entirely local and additive; the deployed prototype is untouched
throughout.

- **Undo the local stack:** `supabase stop --no-backup` then delete `supabase/`. Nothing
  outside the repo is affected.
- **Undo env plumbing:** remove the `ARG`/`ENV` lines from `Dockerfile` and delete
  `app/.env.example`. Existing Dokploy deploys are unaffected because the vars are unset
  and unused until Phase 6.
- **Undo the skills:** delete `.claude/skills/{migration,feature-slice,rls-check,design-compare}/`.
- **Undo the one remote action (repair):** the only remote write is a single row in
  `supabase_migrations.schema_migrations`. Reverse with
  `supabase migration repair --status reverted 00000000000000` (or delete that row). **No
  Tierra schema, policy, or data was changed**, so the shared project and the live Tierra
  app remain exactly as before.
- **What stays safe regardless:** the production Agapay prototype at
  `discipleship.questlaguna.org` keeps serving (no DB calls until Phase 3); the shared
  Supabase project keeps only Tierra's objects plus one benign history row; the
  `discipleship` schema does not yet exist, so there is nothing to leak or break.
