# Agapay — session handoff (state as of 2026-07-12)

Read this first. It is the single source of "where things actually stand",
written so a new session can continue building features without re-deriving
anything. Companions: [`ROADMAP.md`](../ROADMAP.md) (the plan),
[`NOTES.md`](../NOTES.md) (chronological decision log), `CLAUDE.md` (product
rules), [`design/GAPS.md`](../design/GAPS.md) (open questions #1–#40),
[`docs/CUTOVER.md`](./CUTOVER.md) (production runbook).

---

## 1. Where things stand in one table

| Layer | State |
|---|---|
| **Production database** | ✅ LIVE — 15 migrations applied to `ncijotdkovijkcpqnlbv`, `discipleship` schema exposed to the API, master checklists seeded, **174 disciples imported** |
| **Deployed site** (discipleship.questlaguna.org) | ⚠️ still the **seeded demo** — Dokploy env not yet set, so `VITE_DEMO_MODE` defaults to demo |
| **Local dev** | ✅ `app/.env.local` points at production with `VITE_DEMO_MODE=false` → real data at `pnpm dev` |
| **Git** | ⚠️ **47 files uncommitted.** Last commit is `d64ced9 feat: admin disciple detail modal` — everything from Phase 0 onward is unstaged |
| **Discipler logins** | ❌ none yet — 0 of 42 disciplers can sign in |
| **App phases** | 0–5 built & verified; 6 (cutover) partially executed |

**The single most important thing to do next: commit.** Roughly two phases of
work exist only on disk.

## 2. What exists in production right now

Schema `discipleship` (all additive; the directory was provably untouched — an
md5 fingerprint over every member's id/name/stage/discipler/updated_at was
identical before and after the import):

- **8 tables**, every one RLS-enabled, 15 policies: `settings`,
  `disciple_profiles`, `stage_transitions`, `master_checklist_items`,
  `disciple_checklist_items`, `activity_logs`, `meetings`, `milestones`
- **4 views** (`security_invoker`, so RLS applies): `disciple_engagement`,
  `disciple_timeline`, `discipler_load`, `stage_distribution`
- **15 functions**, incl. the three write RPCs (`promote_disciple`,
  `reassign_disciples`, `add_disciple`), `sunday_attendance`, `stage_trend`,
  `set_master_checklist`, `snapshot_checklist`
- **Data**: 174 enrolments, 174 audit rows, 865 checklist items, 0 activity logs

Directory (untouched, for reference): 271 members, 175 with a discipler, 42
disciplers, 28 cell groups, 3 auth users.

## 3. The architecture in five sentences

Agapay is an overlay on the church directory ("Tierra") in a **shared Supabase
project**. The directory (`public.members`) owns identity, stage and
`discipler_id`; Agapay owns everything behavioural in its own `discipleship`
schema. Agapay writes to exactly **two directory columns** — `discipleship_stage`
and `discipler_id` — and only through `security definer` RPCs, so every change
carries an audit row. **A discipler is identified implicitly**: whoever another
member points at via `members.discipler_id` — no role grant needed. Engagement,
queue membership, checklist % and funnel counts are always **derived**, never
stored (RULES #18).

## 4. Decisions that are not obvious from the code

| Decision | Why |
|---|---|
| **Engagement = personal touches only** | `Sunday Service` logs are stored and shown, but excluded from the engagement clock. Otherwise routine attendance recording would silently empty the follow-up queue while nobody was actually being walked with. |
| **Disciplers get `role='member'`, NOT `'discipleship'`** | Production's `is_leader_or_admin()` includes `'discipleship'`, and `members_update_self` lets leaders update *any* member — so that role bypasses Agapay's audit trail entirely (GAPS #33). |
| **Stage vocabulary is three-way** | DB stores `'Newbie'`; the directory UI shows "New Friends"; Agapay shows "New Believer". Mapping lives in `discipleship.to_ui_stage/to_db_stage` + `app/src/lib/stages.ts`. `'New Believer'` is NEVER stored in SQL. |
| **Checklist snapshots are frozen** | Master edits never retro-fit in-progress instances (RULES #20). `scripts/resnapshot-checklists.ts` is the explicit opt-in escape hatch. |
| **Demo mode is the default** | Live auth needs BOTH Supabase env vars AND `VITE_DEMO_MODE=false`, so adding credentials for any reason cannot accidentally put a login wall in front of the public demo. |
| **Master checklist edits go through one RPC** | `set_master_checklist(stage, texts[])` replaces a stage transactionally — client-side delete-then-insert could wipe a stage on a failed second call, and position swaps collide with the unique index. |
| **Account linking stays in the directory app** | `user_profiles.member_id` is written by Tierra's `/admin/users` → `linkAccountToMember`, not by Agapay, keeping Agapay's write boundary at the two `members` columns. |

## 5. Gotchas that cost time — do not rediscover these

1. **Postgres is 17.6 in production.** `config.toml` must say `major_version = 17`;
   the CLI hard-rejects `16`.
2. **Local migrations must contain Tierra's 16 versions**, or `db push` refuses.
   They exist as documented **no-op placeholder files**. Never "repair --status
   reverted" Tierra's real migrations — that corrupts the directory app's history.
   (Reverting *our own* stray rows is fine and was done once.)
3. **`service_role` needs an explicit grant** on any new schema (migration 15).
   Supabase only auto-grants `public`.
4. **PostgREST cannot embed across schemas** — `disciple_profiles` (discipleship)
   → `members` (public) must be two queries joined client-side.
5. **Exposing a schema is a dashboard setting**, not a migration:
   Integrations → Data API → **Settings** → Exposed schemas. `config.toml` only
   affects local. The schema must exist before it appears in the dropdown.
6. **`app/.env.local` is read by Vitest too.** Creating it (to point local dev at
   production) silently flipped `isDemoMode` to false and broke the demo-path
   tests. `mutations.test.tsx` now `vi.mock`s `#/lib/supabase`, so the suite is
   env-independent — verified passing both with and without the file.
7. **`pg_isready` lies** during Postgres's init phase — the test harness probes
   with a real `select 1` twice instead. It also publishes **no host port**
   (collided with another project once) and **aborts on a failed load** rather
   than running assertions against a half-built schema.

## 6. Verify anything

```bash
# app gates
cd app && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build

# database security — 60 assertions, disposable Postgres 17, never touches prod
bash test/rls/run.sh

# what the app looks like locally against PRODUCTION data
cd app && pnpm dev          # app/.env.local already points there
# to fall back to the seeded demo: rm app/.env.local
```

The RLS suite is the safety net for anything touching the schema. It proves
cross-discipler isolation, the personal-touch clock, the attendance sparkline,
the Tierra prime directive, append-only logs, the RPC guards, and anon lockout.

## 7. Immediate next steps (in order)

1. **Commit the 47 files.** Suggested split: `feat: supabase data layer + RLS
   suite`, `feat: auth + role shell`, `feat: read path`, `feat: write path`,
   `feat: analytics + PWA`, `docs: cutover + handoff`.
2. **Prove one discipler end-to-end.** Invite someone with an email (Alma
   Mallari Estrada, 22 disciples, is ideal) as `role='member'`, link her
   account in the directory app's `/admin/users`, then have her sign in locally
   and confirm she sees *only* her 22 people. **Nobody has done this yet — it is
   the biggest untested path.**
3. **Decide the deployment shape**: replace the demo at
   discipleship.questlaguna.org, or run live on a second subdomain so the demo
   survives the pilot (recommended). Then set the three `VITE_` vars in Dokploy
   and redeploy — they are build args, so a restart is not enough.
4. **Chase the 11 missing discipler emails** (list: Admin → Users in the directory app; the discipler with 10
   disciples first).
5. **Run `get_advisors`** (security + performance) against the new schema before
   inviting real users. Not yet done.

## 8. Known gaps / good next features

- **Everyone reads at-risk today** because there are no activity logs yet. Real
  and expected, but the first login is a wall of red. Consider a temporary
  threshold bump (admin-editable, one settings row) during onboarding.
- **Cohorts are empty** — 267 of 271 members have no `joined_date`, so the cohort
  filter is decorative until the directory has that data.
- **96 members have no discipler** — surfaced in the admin dashboard card; the
  bulk-assign flow for them is not built.
- **`add_disciple` has a tested RPC but no UI** (GAPS #14) — the "add a new
  believer" flow is the most obvious missing screen.
- **Meeting recurrence is stored but not materialised** (GAPS #8) — Weekly /
  Biweekly saves the value, nothing generates future meetings.
- **Milestones render but cannot be edited** (GAPS #7) — no UI to mark achieved.
- **No undo on cancel/no-show** (GAPS #18) — one tap, toast only.
- **Discipler-side "unassigned" and admin per-disciple editing** are unbuilt.

## 9. Where the code lives

```
app/src/features/          ← the data layer; start here
  types.ts                 domain shapes every screen uses (DiscipleSummary, …)
  demo-adapters.ts         seed objects → the same shapes (keeps demo working)
  mutations.ts             EVERY write, demo/live switch inside
  disciples|meetings|directory|checklists|admin/
                           api.ts (Supabase) · hooks.ts (demo|live) · queryKeys.ts
app/src/auth.tsx           session provider + <RequireRole> guard
app/src/lib/auth.ts        pure role logic (15 unit tests in auth.test.ts)
app/src/routes/            _discipler/* (mobile) · admin/* (desktop)
supabase/migrations/       baseline + 16 Tierra placeholders + 15 discipleship_*
test/rls/                  auth shim + seed + run.sh (60 assertions)
scripts/                   import-disciples.ts · resnapshot-checklists.ts
```

**Adding a feature?** Follow the existing slice shape: add the query to
`features/<area>/api.ts`, a demo|live hook in `hooks.ts`, keys in
`queryKeys.ts`, writes in `features/mutations.ts`, then wire the screen. If it
touches the schema, add the migration **and** an assertion in `test/rls/run.sh`.
