# Agapay — production cutover runbook (Phase 6)

Everything before this point is local and reversible. This is the first document
that changes the shared Supabase project `ncijotdkovijkcpqnlbv`, which also
serves the live church directory app. **Read the whole thing before starting.**

Nothing here has been executed yet. Steps 1–3 need decisions or credentials only
the church owns.

## Prime directive

Agapay writes to exactly two directory columns —
`public.members.discipleship_stage` and `public.members.discipler_id` — and only
through the `security definer` RPCs, plus minimal `members` inserts for brand-new
believers. Nothing else in `public` is ever modified. Everything else Agapay
stores lives in its own `discipleship` schema, which is purely additive: leaving
it dormant breaks nothing.

## Preconditions

| ✔ | Item | Status |
|---|------|--------|
| ☐ | Migrations verified locally | **done** — `bash test/rls/run.sh` = 59 assertions green |
| ☐ | App gates green | **done** — tsc, lint, 20 tests, build |
| ☐ | `discipleship` exposed to the API | **BLOCKED — see step 2** |
| ☐ | Supabase access token / DB password | needed for `supabase link` |
| ☐ | Pilot circle chosen | recommend TRIBES (Alma, 22 disciples) |

## Step 1 — Push the schema

```bash
supabase link --project-ref ncijotdkovijkcpqnlbv     # asks for the DB password

# The Tierra baseline reconstructs directory tables that ALREADY EXIST in
# production. It must never run there — mark it applied without executing:
supabase migration repair 20260101000000 --status applied

supabase db push        # applies only the discipleship_* migrations
```

`db push` shows the migration list before applying — read it and confirm every
entry is `discipleship_*` (plus the repaired baseline). Production already has
16 migrations of its own (`account_mgmt_*`, `service_attendance*`,
`inventory_module`, …); ours are additive and touch none of them.

**Safer alternative if the plan allows branching:** create a Supabase branch,
push there, run the checks, then merge. That gives a full rehearsal on a copy.

## Step 2 — Expose the schema (REQUIRED, currently blocking)

Supabase dashboard → **Settings → API → Exposed schemas** → add `discipleship` → Save.

Without this, PostgREST answers every Agapay call with
`PGRST106: Invalid schema: discipleship` — verified live on 2026-07-12. The
local `supabase/config.toml` setting covers only the local stack.

Verify:

```bash
curl -s "$VITE_SUPABASE_URL/rest/v1/disciple_engagement?select=disciple_id&limit=1" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Accept-Profile: discipleship"
# expect [] (RLS filtering an anonymous caller), not PGRST106
```

## Step 3 — Seed the master checklists

The stage checklists start empty. Sign in as an admin and enter them under
**Checklists**, or insert the defaults from `CLAUDE.md`. Do this *before* the
import so every enrolled disciple gets a real snapshot.

## Step 4 — Import the congregation

```bash
cd app
node --experimental-strip-types ../scripts/import-disciples.ts            # DRY RUN
node --experimental-strip-types ../scripts/import-disciples.ts --apply    # writes
```

Last dry run (2026-07-12) reported **174 directory members with a discipler**.
The script enrols each into `discipleship.disciple_profiles`, backfills a
"Joined Agapay" stage transition, snapshots their checklist, and derives a cohort
from `joined_date`. It is **idempotent** — already-enrolled members are skipped,
so a partial run is simply re-run. It writes only to the `discipleship` schema.

The ~96 members with **no** `discipler_id` are intentionally left out; they
surface in the admin dashboard's "Members with no discipler" card until someone
is assigned to walk with them.

## Step 5 — Point the app at production

In Dokploy → the `agapay-prototype` app → **Environment**:

```
VITE_SUPABASE_URL=https://ncijotdkovijkcpqnlbv.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_DEMO_MODE=false
```

`VITE_*` values are inlined at **build** time; the Dockerfile takes them as build
args, so a redeploy is required (not just a restart). **Never** add the service
role key here — it bypasses RLS and would ship to every browser.

Leaving `VITE_DEMO_MODE=true` keeps serving the seeded prototype, which is the
right choice if you want the public demo to stay up during the pilot. Consider
deploying the live app on a second subdomain instead of replacing the demo.

## Step 6 — Give disciplers their logins

**Disciples never log in** (v1 scope, CLAUDE.md). Only disciplers and admins.

The chain has FOUR links, and the third is manual:

```
invitation → auth user → user_profiles.member_id → members.discipler_id → their queue
                          ^^^^^^^^^^^^^^^^^^^^^^ this one is NOT automatic
```

`public.handle_new_user()` inserts `user_profiles (id, role)` only — `member_id`
stays NULL. A discipler who signs in unlinked lands on Agapay's "Almost there"
screen, not their queue. (Verified 2026-07-12.)

**Linking is done in the directory admin app, not by Agapay** (decision
2026-07-12): `/admin/users` → the link action, backed by `linkAccountToMember`,
which also enforces one account per member. Agapay writes nothing to
`user_profiles`, keeping its write boundary at the two `members` columns.

So per discipler:
1. Invite them from the church admin app with **`role = 'member'`** (not
   `'discipleship'` — see the warning below).
2. They accept and set a password.
3. In `/admin/users`, **link their account to their member record**.
4. They sign in to Agapay and land on their own queue.

> ⚠️ Give disciplers `role = 'member'`. Agapay identifies a discipler implicitly
> from `members.discipler_id`, so no elevated role is needed — and production's
> `is_leader_or_admin()` includes `'discipleship'`, which would let that role
> edit `public.members` directly and bypass Agapay's promote/reassign audit
> trail (design/GAPS.md #33). Only Agapay admins need `role = 'admin'`.

### 11 disciplers have no email — they cannot be invited yet

They cannot receive an invitation at all until the directory has an address for
them. The church collects these (decision 2026-07-12); rollout starts with the
31 who are reachable. Their disciples stay visible to admins meanwhile.

List: Admin → Users in the directory app (11 disciplers, 27 disciples between them).
The discipler with 10 disciples is the most urgent.

## Step 6b — Invite the pilot disciplers

Send invitations from the existing church admin app (`user_invitations` + Resend).

**Give disciplers `role = 'member'.'** Agapay identifies a discipler implicitly
from `members.discipler_id`, so no elevated role is needed — and production's
`is_leader_or_admin()` includes `'discipleship'`, which would let that role edit
`public.members` directly and bypass Agapay's promote/reassign audit trail
(design/GAPS.md #33). Only Agapay admins need `role = 'admin'`.

## Step 7 — Verify on production

- A pilot discipler signs in → lands on the queue → sees **only** their disciples.
- Logging an activity removes that disciple from the queue and the ring moves.
- Promoting requires a note; afterwards the **church directory app** shows the new
  stage (proving the RPC wrote through) and `stage_transitions` holds the note.
- `mcp__supabase__get_advisors` (security + performance) returns no new ERRORs.
- Diff check: the only directory changes are `discipleship_stage` / `discipler_id`
  on rows an RPC touched.

## Step 8 — Pilot, then widen

Run TRIBES (and optionally one more circle) for 1–2 weeks. Watch for: queue
correctness, engagement resets, promote audit trail, and directory consistency.
Then invite the remaining disciplers circle by circle.

## Rollback

| Situation | Action |
|---|---|
| App misbehaving | Set `VITE_DEMO_MODE=true` and redeploy — instantly back to the seeded prototype |
| Want Agapay gone entirely | Disable/delete the Dokploy app. The `discipleship` schema is additive and harmless when dormant |
| Import went wrong | Re-run it (idempotent), or `delete from discipleship.disciple_profiles` — cascades clean up Agapay data only |
| Schema removal | `drop schema discipleship cascade` — the directory is untouched by this |

The one thing that is **not** trivially reversible: stage/discipler changes
written back to `public.members` by the RPCs. Those are real directory edits,
each with a `stage_transitions` audit row naming who did it and why.
