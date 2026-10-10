# Phase 3 — Read path (queue first)

> Elaborates ROADMAP.md "Phase 3 — Read path: follow-up queue first (2–3 days)".
> Read this together with NOTES.md (locked decisions), RULES.md (binding rules),
> and design/GAPS.md before starting. Prime directive is in effect for every task
> below: **never modify Tierra's schema, policies, or data.** Phase 3 is
> read-only over `public.*`; the only new database objects are `SELECT`-only
> views/functions inside the `discipleship` schema.

---

## 1. Objective

After this phase the app renders **real, database-derived data** on every screen,
feature by feature in CLAUDE.md build order — the follow-up queue first, then
disciples/profile, meetings, and the admin surfaces — sourced from the
`discipleship` schema built in Phase 1 and the shared Tierra directory
(`public.members`, `public.cell_groups`), wired through TanStack Query + a typed
Supabase client. No engagement value, queue membership, checklist %, or funnel
count is stored anywhere; all of it is derived server-side in views or
client-side from raw rows (RULES #18). The prototype's in-memory `store.tsx`
survives only as the `VITE_DEMO_MODE` fallback, so the public demo keeps working
while the live read path grows underneath it.

---

## 2. Prerequisites

Must be complete and green before starting:

- **Phase 0** — local Supabase stack (`supabase start`), Tierra baseline migration
  applied, `discipleship` added to PostgREST exposed schemas
  (`supabase/config.toml` → `[api] schemas = ["public", "discipleship", "storage", "graphql_public"]`),
  `.env.example` with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, and the
  four skills present.
- **Phase 1** — the `discipleship` schema is live with RLS proven by rls-check.
  Phase 3 consumes these Phase-1 objects as **contracts** (columns listed in §4):
  - Tables: `discipleship.profiles`, `disciple_profiles`, `master_checklists`,
    `disciple_checklist_items`, `activity_logs`, `meetings`, `milestones`,
    `stage_transitions`, `settings`.
  - Helpers: `discipleship.current_member_id()`, `discipleship.is_agapay_admin()`.
  - Views: `discipleship.disciple_engagement`, `discipler_load`, `stage_trend`.
  - RLS: discipler sees only rows where `public.members.discipler_id =
    current_member_id()`; admin sees all; `activity_logs` grant is `SELECT` +
    `INSERT` only (no UPDATE/DELETE), so the append-only timeline is structural.
  - Local seed: auth users for Alma / Josie / Gina / Rodel / Ptr. Danilo, the
    43 disciples as `members` + `disciple_profiles`, activities/meetings matching
    the prototype spread.
- **Phase 2** — real login + a session/profile context that exposes the signed-in
  user's **role** *and* **`member_id`** (Phase 3 needs `member_id` for query keys
  and `.eq('discipler_id', …)` filters). If Phase 2 only exposed `role`, extend
  it (Work item 3). `VITE_DEMO_MODE` flag exists and gates the prototype role bar.

If any Phase-1 view is missing a column listed in §4, that is a **Phase-1
amendment** (same migration family), not net-new schema here — flag it and fix it
in Phase 1's `discipleship_views` migration rather than duplicating the view.

---

## 3. Work items (ordered)

Build strictly in this order so the hero queue is real before anything else, per
CLAUDE.md build order and RULES #11.

### 3.0 — Client plumbing (blocks everything)

**3.0.1 Install deps.** Add `@tanstack/react-query` (and
`@tanstack/react-query-devtools`) and `@supabase/supabase-js` to `app/`.
`pnpm add @tanstack/react-query @supabase/supabase-js` +
`pnpm add -D @tanstack/react-query-devtools`.

**3.0.2 Typed Supabase client** — `app/src/lib/supabase.ts`.
- Validate env at boot (fail fast, RULES / coding-style input-validation):
```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '#/lib/database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
}

// Default schema is public (members, cell_groups). Reach discipleship objects
// with supabase.schema('discipleship').from(...). Never a service-role key here.
export const supabase = createClient<Database>(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
})

export function isDemoMode(): boolean {
  return import.meta.env.VITE_DEMO_MODE === 'true'
}
```

**3.0.3 Generated DB types** — `app/src/lib/database.types.ts`.
Add pnpm script `"gen:types": "supabase gen types typescript --local --schema public,discipleship > src/lib/database.types.ts"`.
Commit the generated file so `tsc --noEmit` is deterministic in CI. Roadmap exit
gate requires `supabase gen types --schema public,discipleship` to compile strict.

**3.0.4 Query client + provider** — `app/src/lib/query-client.ts` and
`app/src/main.tsx`.
```ts
// query-client.ts
import { QueryClient } from '@tanstack/react-query'
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})
```
Wrap the app: `<QueryClientProvider client={queryClient}>` OUTSIDE the existing
`<StoreProvider>` in `main.tsx`. Keep `StoreProvider` — demo mode and Phase-4
mutations still use it. Add devtools only when `import.meta.env.DEV`.

**3.0.5 Fetch envelope helper** — `app/src/lib/supabase-result.ts`.
supabase-js already returns `{ data, error }`; standardize unwrapping so every
`queryFn` throws on error (TanStack owns loading/error UI):
```ts
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  if (res.data === null) throw new Error('No data returned')
  return res.data
}
```

**3.0.6 Session member id** — `app/src/features/session/queries.ts` +
`queryKeys.ts`. Read the signed-in user's `discipleship.profiles` row:
```ts
export const sessionKeys = { profile: () => ['session', 'profile'] as const }
// queryFn (live): supabase.schema('discipleship').from('profiles')
//   .select('member_id, role, members(name)').single()  → { memberId, role, name }
// demo: { memberId: 'alma', role: 'discipler', name: 'Alma Mallari Estrada' }
```
Prefer extending the Phase-2 auth/session context to expose `memberId` and
re-exporting from here rather than duplicating the fetch.

**3.0.7 Settings (thresholds)** — `app/src/features/settings/queries.ts`.
The engagement thresholds live in the DB `settings` table (Phase 1) so admins can
tune them (RULES #17). Fetch once, cache long:
```ts
export const settingsKeys = { all: () => ['settings'] as const }
// live: supabase.schema('discipleship').from('settings')
//   .select('amber_after_days, red_after_days').single()
// demo/fallback: { amber_after_days: 14, red_after_days: 28 }  (from lib/engagement.ts)
```
Refactor `app/src/lib/engagement.ts`: keep `ENGAGEMENT = { amberAfterDays: 14,
redAfterDays: 28 }` as the demo/default constant, and add a pure
`engagementFrom(days: number, t = ENGAGEMENT): EngagementInfo`. The existing
`engagement(days)` delegates to `engagementFrom(days, ENGAGEMENT)`. Live screens
pass the fetched thresholds; nothing hardcodes 14/28 in a component (RULES #17).

**Feature folder convention** (new in Phase 3, per coding-style "organize by
feature", many small files): each slice is `app/src/features/<feature>/` with:
- `queryKeys.ts` — key factory (typed `as const`).
- `api.ts` — pure fetchers: `liveFetchX()` (Supabase) and `demoFetchX()` (reads
  `#/data/seed`). One `fetchX()` picks by `isDemoMode()`.
- `queries.ts` — TanStack `useX()` hooks (`useQuery` wrapping `api.ts`).
- `types.ts` — read-model types for that feature.
- `<Feature>Skeleton.tsx` — loading skeleton matching card geometry (RULES #17
  gap in GAPS #17; skeletons follow the design card silhouette).

Routes keep their current file paths; only their **data source** changes from
`useStore()` to the feature hooks. This is the contained swap NOTES.md promised.

---

### 3.1 — Slice 1: follow-up queue (the hero)

**What:** the Discipler Home (`app/src/routes/_discipler/index.tsx`) reads the
queue from `discipleship.disciple_engagement` instead of `useStore().disciples`.
The urgency groups, 64px progress ring, three stat chips, and empty-state
celebration must be pixel-identical to the prototype; only the source changes.

**Files:**
- `app/src/features/queue/queryKeys.ts`
- `app/src/features/queue/types.ts` — `EngagementRow` (§4).
- `app/src/features/queue/api.ts` — `fetchQueue(disciplerId)`.
- `app/src/features/queue/queries.ts` — `useQueue()`.
- `app/src/features/queue/QueueSkeleton.tsx`.
- Edit `app/src/routes/_discipler/index.tsx` to consume `useQueue()`,
  `useSettings()`, `useWeekMeetings()` (from slice 3).

**Live fetch (`api.ts`):**
```ts
// RLS on disciple_engagement already scopes to the discipler; .eq is defensive.
const res = await supabase
  .schema('discipleship')
  .from('disciple_engagement')
  .select(
    'disciple_id, name, stage, discipler_id, cohort, life_group_id, life_group_name,' +
    ' last_activity_at, days_since, last_activity_type, checklist_done, checklist_total, in_stage_since',
  )
  .eq('discipler_id', disciplerId)
const rows = unwrap(res)
```
Map each row to the shape the existing `queueGroups()`/`engagement()` in
`lib/derive.ts` already expect: it groups on `days`. Provide `days = days_since`,
`stage = fromDbStage(row.stage)`, `lastSeen = buildLastSeen(row)`. **Reuse
`lib/derive.ts#queueGroups` and `lib/engagement.ts` unchanged** so grouping logic,
sort order (longest-quiet first), ring fraction, and thresholds stay single-sourced
(RULES #17/#18). Pass fetched thresholds into a thresholds-aware `queueGroups`
variant, or keep the 14/28 default until an admin changes them.

**DB — Phase-1 contract, verify columns exist.** `disciple_engagement` must
expose (add to Phase 1's `discipleship_views` migration if absent):

```sql
-- discipleship.disciple_engagement  (SECURITY INVOKER so RLS on members/activity_logs applies)
-- Derived-only: no engagement/day counts are ever stored (RULES #18).
CREATE VIEW discipleship.disciple_engagement
WITH (security_invoker = true) AS
SELECT
  dp.member_id                                   AS disciple_id,
  m.id                                           AS member_id,
  m.name                                         AS name,
  m.discipleship_stage                           AS stage,          -- raw Tierra label; map client-side
  m.discipler_id                                 AS discipler_id,
  dp.cohort                                      AS cohort,
  cg.id                                          AS life_group_id,  -- active Quest Circle
  cg.name                                        AS life_group_name,
  la.last_activity_at                            AS last_activity_at,
  la.last_activity_type                          AS last_activity_type,
  -- Asia/Manila day math; raw fact only, status derived downstream:
  GREATEST(0, (date_trunc('day', now() AT TIME ZONE 'Asia/Manila')
             - date_trunc('day', la.last_activity_at AT TIME ZONE 'Asia/Manila')))::int / 86400
                                                 AS days_since,     -- integer days
  st.entered_at                                  AS in_stage_since,
  ci.done_count                                  AS checklist_done,
  ci.total_count                                 AS checklist_total
FROM discipleship.disciple_profiles dp
JOIN public.members m               ON m.id = dp.member_id AND NOT m.is_archived
LEFT JOIN LATERAL (
  -- newest active cell-group membership = the disciple's Quest Circle
  SELECT cg.id, cg.name
  FROM public.member_cell_groups mcg
  JOIN public.cell_groups cg ON cg.id = mcg.cell_group_id AND cg.is_active
  WHERE mcg.member_id = m.id AND mcg.is_active
  ORDER BY mcg.joined_at DESC
  LIMIT 1
) cg ON true
LEFT JOIN LATERAL (
  -- last activity = max(activity_logs.occurred_at, completed meetings.completed_at)
  SELECT max(t.at) AS last_activity_at,
         (array_agg(t.kind ORDER BY t.at DESC))[1] AS last_activity_type
  FROM (
    SELECT al.occurred_at AS at, al.activity_type::text AS kind
    FROM discipleship.activity_logs al WHERE al.disciple_id = m.id
    UNION ALL
    SELECT mt.completed_at AS at, 'Meeting' AS kind
    FROM discipleship.meetings mt
    WHERE mt.disciple_id = m.id AND mt.status = 'completed' AND mt.completed_at IS NOT NULL
  ) t
) la ON true
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE dci.completed_at IS NOT NULL) AS done_count,
         count(*) AS total_count
  FROM discipleship.disciple_checklist_items dci WHERE dci.disciple_id = m.id
) ci ON true
LEFT JOIN LATERAL (
  SELECT max(stt.created_at) AS entered_at
  FROM discipleship.stage_transitions stt
  WHERE stt.disciple_id = m.id AND stt.to_stage = m.discipleship_stage
) st ON true;

GRANT SELECT ON discipleship.disciple_engagement TO authenticated;
```
`security_invoker = true` (Postgres 15+) is mandatory: the view inherits the
querying discipler's RLS, so a discipler cannot read another discipler's rows even
through the view. **Do not** use `SECURITY DEFINER` here.

**Skeleton:** `QueueSkeleton.tsx` renders the header card + ring placeholder + two
grey card silhouettes (44px avatar disc + two text bars + 3-cell footer) matching
`QuietCard` geometry, using `bg-cream-surface` shimmer. No layout shift on load.

---

### 3.2 — Slice 2: disciples list + profile read model (timeline = union)

**What:** the My Disciples tab (`_discipler/disciples.index.tsx`), the disciple
profile push-page (`_discipler/disciples.$id.tsx`), and the shared detail
sections (`components/disciple-detail.tsx`) read from the DB. Timeline is the
append-only union read model (GAPS #11, RULES #21).

**Files:**
- `app/src/features/disciples/queryKeys.ts`
- `app/src/features/disciples/types.ts` — `DiscipleListRow`, `DiscipleProfile`,
  `TimelineRow`, `AttendanceWeek` (§4).
- `app/src/features/disciples/api.ts` — `fetchMyDisciples(disciplerId)`,
  `fetchDisciple(discipleId)`, `fetchTimeline(discipleId)`,
  `fetchAttendance(discipleId)`, `fetchChecklist(discipleId)`.
- `app/src/features/disciples/queries.ts` — `useMyDisciples()`, `useDisciple(id)`,
  `useTimeline(id)`, `useAttendance(id)`, `useChecklist(id)`.
- `app/src/features/disciples/DisciplesSkeleton.tsx`,
  `ProfileSkeleton.tsx`.
- Edit the three route/component files to consume the hooks.

**List fetch:** reuse `disciple_engagement` (already carries stage, days_since,
checklist_done/total, life_group_name) filtered by `discipler_id`. The mini
checklist bar % = `Math.round(100*checklist_done/checklist_total)` via existing
`lib/derive.ts` (adapt `checklistPct` to accept the row). No separate query.

**Profile:** `useDisciple(id)` selects one `disciple_engagement` row plus
`in_stage_since` (for the "N months in stage" label — derive client-side from
`in_stage_since` to now). Promote button visibility uses `nextStage()` on the
mapped stage. Timeline/checklist/meetings/milestones load per-tab.

**DB — timeline union view (net-new Phase-3 read model).** Add migration
`supabase/migrations/<ts>_discipleship_read_models.sql`:
```sql
-- Append-only timeline as a read model: union of the four raw sources.
-- No timeline table exists; correctness falls out of the sources (RULES #21).
CREATE VIEW discipleship.disciple_timeline
WITH (security_invoker = true) AS
SELECT al.disciple_id, al.occurred_at AS occurred_at,
       CASE WHEN al.activity_type = 'Note' THEN 'note' ELSE 'activity' END AS kind,
       al.activity_type::text AS title, al.note AS note
FROM discipleship.activity_logs al
UNION ALL
SELECT mt.disciple_id, mt.completed_at AS occurred_at,
       'meeting' AS kind, 'Meeting completed' AS title, mt.note
FROM discipleship.meetings mt
WHERE mt.status = 'completed' AND mt.completed_at IS NOT NULL
UNION ALL
SELECT dci.disciple_id, dci.completed_at AS occurred_at,
       'check' AS kind, dci.item_text AS title, NULL::text
FROM discipleship.disciple_checklist_items dci
WHERE dci.completed_at IS NOT NULL
UNION ALL
SELECT stt.disciple_id, stt.created_at AS occurred_at,
       'stage' AS kind,
       COALESCE('Promoted to ' || stt.to_stage, 'Joined Agapay') AS title, stt.note
FROM discipleship.stage_transitions stt;

GRANT SELECT ON discipleship.disciple_timeline TO authenticated;
```
Fetch: `.schema('discipleship').from('disciple_timeline').eq('disciple_id', id)
.order('occurred_at', { ascending: false })`. Map `kind` to the existing
`TIMELINE_STYLE` glyphs in `components/disciple-detail.tsx`; format `occurred_at`
→ `fmtShort` (Asia/Manila) for `dateLabel`. **Dependency:**
`disciple_checklist_items` needs `completed_at timestamptz` and `item_text`
(snapshot label); `stage_transitions` needs `to_stage` + `note` + `created_at`.
If Phase 1 omitted `completed_at`, `check` events simply don't appear yet
(populated in Phase 4) — acceptable, non-blocking.

**DB — 12-week attendance (net-new Phase-3 read model).** The sparkline derives
from logged `Sunday Service` activities bucketed into the last 12 Sundays,
Asia/Manila (GAPS #6). Parameterized function (one disciple at a time; keep the
view surface small):
```sql
-- SECURITY INVOKER (default) → RLS on activity_logs applies to the caller.
CREATE FUNCTION discipleship.disciple_attendance(p_disciple uuid, p_weeks int DEFAULT 12)
RETURNS TABLE (week_start date, attended boolean)
LANGUAGE sql STABLE
SET search_path = discipleship, public
AS $$
  WITH sundays AS (
    SELECT (date_trunc('week', (now() AT TIME ZONE 'Asia/Manila')::date - (g * 7))
            - interval '1 day')::date AS wk   -- Sunday of each of the last p_weeks weeks
    FROM generate_series(p_weeks - 1, 0, -1) AS g
  )
  SELECT s.wk AS week_start,
         EXISTS (
           SELECT 1 FROM discipleship.activity_logs al
           WHERE al.disciple_id = p_disciple
             AND al.activity_type = 'Sunday Service'
             AND (al.occurred_at AT TIME ZONE 'Asia/Manila')::date
                 BETWEEN s.wk AND s.wk + 6
         ) AS attended
  FROM sundays s
  ORDER BY s.wk;
$$;

GRANT EXECUTE ON FUNCTION discipleship.disciple_attendance(uuid, int) TO authenticated;
```
Fetch via RPC: `supabase.schema('discipleship').rpc('disciple_attendance',
{ p_disciple: id })` → array of 12 `{ week_start, attended }`, oldest→newest,
mapped to the existing `boolean[12]` the `AttendanceSparkline` consumes.

**Checklist:** `.schema('discipleship').from('disciple_checklist_items')
.eq('disciple_id', id).order('sort_order')` → `{ item_text, completed_at }[]`,
mapped to `{ text, done: completed_at != null }` for the existing `ChecklistCard`.
Toggling is Phase 4; Phase 3 renders read-only from `completed_at`.

**Milestones:** `.schema('discipleship').from('milestones').eq('disciple_id', id)
.order('sort_order')` → `{ title, achieved_at }[]` → `{ title, dateLabel:
achieved_at ? fmtShort(...) : null }` for `MilestonesList`.

**Skeletons:** `DisciplesSkeleton` = 4–5 row-card silhouettes (42px disc + name
bar + mini progress bar). `ProfileSkeleton` = header block + sparkline panel +
tab-pill row + three timeline-item silhouettes.

---

### 3.3 — Slice 3: meetings list (upcoming / past) + this-week

**What:** the Meetings tab (`_discipler/meetings.tsx`), the Home "This week" rows,
and the profile Meetings tab read from `discipleship.meetings` joined to member
names. Statuses stay `upcoming | completed | cancelled | noshow`.

**Files:**
- `app/src/features/meetings/queryKeys.ts`
- `app/src/features/meetings/types.ts` — `MeetingRow` (§4).
- `app/src/features/meetings/api.ts` — `fetchMyMeetings(disciplerId)`,
  `fetchDiscipleMeetings(discipleId)`, `fetchWeekMeetings(disciplerId)`.
- `app/src/features/meetings/queries.ts` — `useMyMeetings()`,
  `useDiscipleMeetings(id)`, `useWeekMeetings()`.
- `app/src/features/meetings/MeetingsSkeleton.tsx`.
- Edit `_discipler/meetings.tsx`, `_discipler/index.tsx` (WeekRow),
  `components/disciple-detail.tsx` (`MeetingsList`).

**Fetch:** meetings carry `disciple_id`; join the name for display:
```ts
supabase.schema('discipleship').from('meetings')
  .select('id, disciple_id, scheduled_at, duration_min, mode, place, recurrence, status, note, members:disciple_id ( name )')
  .order('scheduled_at', { ascending: true })
```
RLS scopes to the discipler's disciples. `scheduled_at timestamptz` replaces the
prototype's `dateISO`+`time`; derive `dateISO`/`time` display with existing
`lib/format.ts` (`fromISODate`, `fmtTime12`) after splitting in Asia/Manila.
Reuse `lib/derive.ts#upcomingThisWeek` and `MEETING_STATUS_CHIP` unchanged;
`upcomingThisWeek` filters `status === 'upcoming'` in the next 7 days.
Upcoming/past split: `status === 'upcoming'` vs the rest, sorted per prototype.

**Cross-feature note:** the Home queue (slice 1) and the This-week block need
`useWeekMeetings()`; wire it when editing `_discipler/index.tsx` in slice 1 or 3
— keep the query keyed by `disciplerId` so both consumers share the cache.

**Skeleton:** `MeetingsSkeleton` = date-column + text-bar row silhouettes ×3, plus
the 3-action footer bar for the upcoming variant.

---

### 3.4 — Slice 4: admin reads

**What:** the admin Dashboard (`admin/index.tsx`), Disciples table
(`admin/disciples.tsx`), and the shared admin detail modal
(`components/admin-disciple-modal.tsx`) read real data. Admin RLS returns all
rows, so admin fetches are the same views without the `discipler_id` filter.

**Files:**
- `app/src/features/admin/queryKeys.ts`
- `app/src/features/admin/types.ts` — `DisciplerLoadRow`, `StageTrendRow`,
  `CircleRow` (§4).
- `app/src/features/admin/api.ts` — `fetchAllEngagement(filters)`,
  `fetchDisciplerLoad()`, `fetchStageTrend()`, `fetchCircles()`.
- `app/src/features/admin/queries.ts` — `useAllEngagement(filters)`,
  `useDisciplerLoad()`, `useStageTrend()`, `useCircles()`.
- `app/src/features/admin/AdminSkeleton.tsx` (KPI tiles + card silhouettes).
- Edit `admin/index.tsx`, `admin/disciples.tsx`,
  `components/admin-disciple-modal.tsx`, `components/stage-trend.tsx`.

**Dashboard aggregates — computed client-side from `disciple_engagement` rows**
(matches the prototype exactly: `countEngagement`, `avgChecklist`, stage funnel
`share`, per-circle breakdown — all pure derivations over the fetched pool; 43
rows, trivial cost). Keep those helper functions in `admin/index.tsx`; only their
input changes from `useStore().disciples` to `useAllEngagement()`. Needs-attention
list = `days_since > amberAfterDays` (amber+red), sorted desc — same rule, from
the fetched rows. Do **not** add server-side aggregate views (avoid redundant DB
surface; RULES #18 is satisfied because inputs are already derived).

**Quest Circles — from `public.cell_groups` (RULES: not seed).** Circles panel
lists active cell groups at satellite "Quest Laguna Main"; per-circle membership
counts / engagement come from grouping the `disciple_engagement` pool by
`life_group_id`:
```ts
// fetchCircles(): read-only over Tierra
supabase.from('cell_groups')
  .select('id, name, satellite_id, leader_id, is_active, satellites:satellite_id ( name ), members:leader_id ( name )')
  .eq('is_active', true)
```
Filter to the Quest Laguna Main satellite name client-side (or by
`satellite_id`). Leader name via the `leader_id → members` join. This is a plain
SELECT on Tierra tables allowed by the existing `cell_groups_read_auth` /
`members_read_public` policies — **no new policy, no write** (GAPS #25).

**Discipler load — `discipleship.discipler_load` view (Phase-1 contract).**
Columns Phase 3 reads: `discipler_id, name, life_group_name, load,
last_log_at, days_since_last_log`. Client computes `inactive =
days_since_last_log > amberAfterDays` (RULES #17; do not store the flag). If Phase
1's view lacks `days_since_last_log`/`last_log_at`, amend it there:
```sql
-- discipleship.discipler_load  (contract shape; SECURITY INVOKER)
--   per discipler-member: assigned-disciple count + own last activity_log recency
--   last_log_at = max(activity_logs.occurred_at) where the discipler is the actor
```
`daysAgoLabel(days_since_last_log)` (existing `lib/format.ts`) renders "Last log".

**Stage trend — `discipleship.stage_trend` view (Phase-1 contract).** Monthly
per-stage counts from `stage_transitions` history. `useStageTrend()` returns
`{ month, new_believer, growing, leader }[]`; the current month is appended live
from the current `disciple_engagement` pool (as the prototype does). Replace
`STAGE_TREND_HISTORY` (seed) with the view; keep the seed value as demo fallback.
`components/stage-trend.tsx` chart stays; only its `history` prop source changes.

**Admin detail modal:** deep-link `?disciple=<id>` stays; the modal reuses
`useDisciple(id)`, `useTimeline(id)`, `useAttendance(id)`, `useChecklist(id)`,
`useDiscipleMeetings(id)` from slices 2–3, so admin and discipler render the same
read models (no duplication).

---

### 3.5 — Demo-mode fallback + stage mapping + cleanup

**3.5.1 Stage boundary mapping** — extend `app/src/lib/stages.ts`:
```ts
// Tierra stores 'Newbie'; live UI has shown 'New Friends'/'Schooling' (GAPS #27/#32).
// Map defensively at the data boundary; confirm the real CHECK before Phase 6.
const DB_TO_STAGE: Record<string, Stage> = {
  Newbie: 'New Believer', 'New Friends': 'New Believer',
  Growing: 'Growing', Schooling: 'Growing',
  Leader: 'Leader',
}
export function fromDbStage(db: string): Stage {
  const s = DB_TO_STAGE[db]
  if (!s) throw new Error(`Unknown discipleship_stage from directory: ${db}`)
  return s
}
export function toDbStage(stage: Stage): string { /* inverse, canonical writes = Newbie/Growing/Leader */ }
```
UI never renders "Newbie"/"New Friends"/"Schooling".

**3.5.2 Demo fallback.** Each `api.ts` `demoFetchX()` reads `#/data/seed`, shaped
identically to the live fetch, so `VITE_DEMO_MODE=true` keeps the public demo
green with zero network. The seed store (`store.tsx`) is no longer the read source
in live mode but stays mounted for Phase-4 mutations and demo mode. Mark
`Disciple.days`, `Discipler.lastLogDays`, `STAGE_TREND_HISTORY` in seed with a
"demo-only" comment (already partly done).

**3.5.3 No stored engagement audit.** Grep guard (Work item / test) that no
migration adds a stored `days`/engagement/`checklist_pct`/queue column, and that
live components read `days_since` (derived) — RULES #18, roadmap exit gate.

---

## 4. Interfaces & contracts

### 4.1 Query key factories (per feature)

```ts
// session
export const sessionKeys = { profile: () => ['session', 'profile'] as const }
// settings
export const settingsKeys = { all: () => ['settings'] as const }
// queue
export const queueKeys = {
  all: () => ['queue'] as const,
  byDiscipler: (id: string) => ['queue', id] as const,
}
// disciples
export const discipleKeys = {
  list: (disciplerId: string) => ['disciples', { disciplerId }] as const,
  detail: (id: string) => ['disciple', id] as const,
  timeline: (id: string) => ['disciple', id, 'timeline'] as const,
  attendance: (id: string) => ['disciple', id, 'attendance'] as const,
  checklist: (id: string) => ['disciple', id, 'checklist'] as const,
  milestones: (id: string) => ['disciple', id, 'milestones'] as const,
}
// meetings
export const meetingKeys = {
  byDiscipler: (id: string) => ['meetings', { disciplerId: id }] as const,
  byDisciple: (id: string) => ['meetings', 'disciple', id] as const,
  week: (id: string) => ['meetings', 'week', id] as const,
}
// admin
export const adminKeys = {
  engagement: (filters: unknown) => ['admin', 'engagement', filters] as const,
  disciplerLoad: () => ['admin', 'disciplerLoad'] as const,
  stageTrend: () => ['admin', 'stageTrend'] as const,
  circles: () => ['admin', 'circles'] as const,
}
```

### 4.2 Read-model types (feature `types.ts`)

```ts
// queue / disciples list — one disciple_engagement row (raw stage string; map with fromDbStage)
export interface EngagementRow {
  disciple_id: string
  name: string
  stage: string            // raw DB label
  discipler_id: string | null
  cohort: string | null
  life_group_id: string | null
  life_group_name: string | null
  last_activity_at: string | null   // ISO timestamptz
  days_since: number                // derived, never stored
  last_activity_type: string | null
  checklist_done: number
  checklist_total: number
  in_stage_since: string | null
}
export interface TimelineRow {
  disciple_id: string
  occurred_at: string
  kind: 'activity' | 'meeting' | 'note' | 'check' | 'stage'
  title: string
  note: string | null
}
export interface AttendanceWeek { week_start: string; attended: boolean }
export interface MeetingRow {
  id: string
  disciple_id: string
  disciple_name: string
  scheduled_at: string     // timestamptz
  duration_min: number
  mode: 'inperson' | 'online'
  place: string
  recurrence: 'none' | 'weekly' | 'biweekly'
  status: 'upcoming' | 'completed' | 'cancelled' | 'noshow'
  note: string | null
}
export interface DisciplerLoadRow {
  discipler_id: string
  name: string
  life_group_name: string | null
  load: number
  last_log_at: string | null
  days_since_last_log: number
}
export interface StageTrendRow {
  month: string            // 'Feb' … 'Jul'
  new_believer: number
  growing: number
  leader: number
}
export interface CircleRow {
  id: string
  name: string
  satellite_name: string | null
  leader_name: string | null
  is_active: boolean
}
```

### 4.3 Envelope & data-source contracts

- **Envelope:** none custom. supabase-js returns `{ data, error }`; `unwrap<T>()`
  throws on `error`, TanStack Query surfaces `isLoading`/`isError`. Query hooks
  return `{ data, isLoading, isError, error }`.
- **Data source switch:** every `fetchX()` = `isDemoMode() ? demoFetchX() :
  liveFetchX()`. Signatures identical; return types identical.
- **Reused pure helpers (unchanged):** `lib/derive.ts` (`queueGroups`,
  `upcomingThisWeek`, `checklistPct`, `MEETING_STATUS_CHIP`), `lib/engagement.ts`
  (`engagement`, new `engagementFrom`), `lib/stages.ts` (`stagePill`, `stageBar`,
  `nextStage`, new `fromDbStage`/`toDbStage`), `lib/format.ts`.

### 4.4 Database objects touched/created

| Object | Schema | Phase | Access | Phase-3 role |
|---|---|---|---|---|
| `disciple_engagement` (view) | discipleship | 1 (verify cols) | SELECT, invoker | queue, list, profile, admin aggregates |
| `discipler_load` (view) | discipleship | 1 (verify cols) | SELECT, invoker | admin discipler-load |
| `stage_trend` (view) | discipleship | 1 | SELECT, invoker | admin trend chart |
| `disciple_timeline` (view) | discipleship | **3 (new)** | SELECT, invoker | profile/modal timeline |
| `disciple_attendance(uuid,int)` (fn) | discipleship | **3 (new)** | EXECUTE, invoker | sparkline |
| `settings` (table) | discipleship | 1 | SELECT | thresholds |
| `members`, `cell_groups`, `member_cell_groups`, `satellites` | public (Tierra) | pre-existing | SELECT only | names, circles, stage |

- **RPC signatures created:** none for writes (Phase 3 is read-only). Only the
  read function `discipleship.disciple_attendance(p_disciple uuid, p_weeks int
  default 12) returns table(week_start date, attended boolean)`.
- All new discipleship views/functions are `security_invoker`/`SECURITY INVOKER`
  so discipler RLS flows through; `GRANT SELECT/EXECUTE … TO authenticated` only
  (never `anon` writes, never `service_role` in the client).

---

## 5. Test plan

Runnable checks; add to `app/` Vitest suite and a `supabase/tests/` SQL/RLS
harness (rls-check skill). CI order: `pnpm gen:types` → `tsc --noEmit` → `pnpm
lint` → `pnpm test` → `pnpm build`.

### 5.1 Unit (Vitest, pure functions)
- `queueGroups` with fetched-shaped rows reproduces the prototype grouping: for
  Alma's 11 disciples (seed), `quiet` = [d1 (34d), d2 (31d)] sorted desc,
  `cooling` = [d3 (21d)], `queueCount` = 3, `ringFraction` = 8/11.
- `engagementFrom(days, {amber:14,red:28})` → red>28, amber 15–28, green ≤14
  boundary cases (14→green, 15→amber, 28→amber, 29→red).
- `fromDbStage`: 'Newbie'→'New Believer', 'Schooling'→'Growing', 'Leader'→
  'Leader'; unknown throws.
- `checklistPct` from `{checklist_done, checklist_total}`.
- Timeline mapper: DB `kind` → correct `TIMELINE_STYLE` glyph; `Note` activity →
  `note` kind, others → `activity`.

### 5.2 Integration (Vitest + local Supabase, anon client signed in as a seed user)
- **Queue parity:** signed in as Alma, `fetchQueue('alma_member_id')` returns
  exactly her 11 disciples with `days_since` matching the seed activity spread
  (±0 given fixed seed timestamps); no rows for Josie/Gina/Rodel disciples.
- **Days-since correctness:** for a seeded disciple whose last activity is N days
  before "today" (Asia/Manila), `days_since === N` — proves server derivation,
  no stored value (RULES #18).
- **Timeline union:** `fetchTimeline(d1)` returns activity + completed-meeting +
  stage rows ordered `occurred_at` desc; a cancelled/noshow meeting does NOT
  appear; a `Note` activity appears as `kind:'note'`.
- **Attendance:** `rpc('disciple_attendance', { p_disciple: d1 })` returns 12
  rows oldest→newest; a disciple with a logged `Sunday Service` in week W has
  `attended=true` only in that bucket.
- **Meetings:** `fetchWeekMeetings` returns only `upcoming` meetings within 7 days
  Asia/Manila; statuses map 1:1 to `MEETING_STATUS_CHIP`.
- **Admin aggregates:** as Ptr. Danilo, `fetchAllEngagement()` returns all 43
  rows; client `countEngagement`/`avgChecklist`/stage funnel equal the prototype
  numbers for the same seed.
- **Circles:** `fetchCircles()` returns TRIBES / CHOSEN GENERATION / SOULDIERS
  (active, Quest Laguna Main) with correct leader names from `members`.

### 5.3 RLS checks (rls-check skill — exact scenarios, seeded users)

| # | Signed-in user | Query | Expected |
|---|---|---|---|
| R1 | Alma (discipler) | `SELECT * FROM discipleship.disciple_engagement` | **allow**, returns only Alma's 11 disciples |
| R2 | Alma | `SELECT * FROM discipleship.disciple_engagement WHERE discipler_id = <Josie's member_id>` | **allow query, 0 rows** (RLS filters Josie's disciples out) |
| R3 | Josie (discipler) | `fetchQueue(Josie)` | **allow**, returns her 10 disciples incl. Cheska (41d, at-risk); none of Alma's |
| R4 | Alma | `SELECT * FROM discipleship.activity_logs WHERE disciple_id = <d12 (Josie's)>` | **deny/0 rows** (base-table RLS; view inherits via security_invoker) |
| R5 | Alma | `SELECT * FROM discipleship.disciple_timeline WHERE disciple_id = <d12>` | **0 rows** (invoker RLS on underlying activity_logs/meetings) |
| R6 | Alma | `rpc('disciple_attendance', { p_disciple: <d12> })` | **0/empty** (invoker RLS blocks the base rows) |
| R7 | Ptr. Danilo (admin) | `SELECT * FROM discipleship.disciple_engagement` | **allow**, all 43 rows |
| R8 | Ptr. Danilo | `SELECT * FROM discipleship.discipler_load` | **allow**, 4 disciplers incl. Josie flagged inactive (18d > 14) |
| R9 | anon (logged out) | any discipleship view | **deny** (no `authenticated` grant / RLS) |
| R10 | Alma | any `UPDATE`/`INSERT` on `public.members` | **deny** (Tierra prime directive; writes only via Phase-4 RPCs) — sanity re-check |

### 5.4 E2E (Playwright, `VITE_DEMO_MODE=false` against local seed)
- Log in as Alma → lands on `/`, queue shows "3 check-ins to go", ring fraction
  8/11, "Quiet for a while" = Marilou + Gemma, "2 at-risk" chip.
- Open Marilou's profile → timeline, 12-week sparkline, Leader checklist %,
  2 no-show meetings visible in Meetings tab.
- Log in as Ptr. Danilo → `/admin`; KPI tiles, stage funnel, at-risk list, Quest
  Circles (3 from `cell_groups`), discipler-load with Josie "Inactive".
- Screenshot pass at 375px and 1280px vs the prototype (design-compare skill);
  Lighthouse sanity on 375px (roadmap exit gate).
- Loading states: throttle network → skeletons render with the card geometry, no
  layout shift when data arrives.

### 5.5 Type/build gates
- `pnpm gen:types` produces a `database.types.ts` that compiles; `pnpm exec tsc
  --noEmit && pnpm lint && pnpm build` all green (standing verification).

---

## 6. Exit gate

**Single testable condition:** With the local Supabase stack + Phase-1 seed
applied and `VITE_DEMO_MODE=false`, `pnpm gen:types && pnpm exec tsc --noEmit &&
pnpm lint && pnpm test && pnpm build` all pass — where `pnpm test` includes the
§5.2 parity integration suite (every screen's data equals the seeded prototype
numbers) and the §5.3 RLS suite (R1–R10) — and a grep guard confirms no stored
engagement/queue/checklist-percent column or field exists (RULES #18). Do not
start Phase 4 until this passes.

---

## 7. Risks & mitigations

- **Tierra-safety prime directive (highest).** Phase 3 must be read-only over
  `public.*`. Mitigation: the client uses the **anon key only**; all new
  discipleship views/functions are `SELECT`/`EXECUTE`-only and never touch Tierra
  writes; no new policy is added to any `public.*` table (existing
  `members_read_public` / `cell_groups_read_auth` already permit the reads, GAPS
  #25). R10 re-verifies no accidental write path. Never `SECURITY DEFINER` on a
  read view (would bypass discipler RLS).
- **`security_invoker` support.** Requires Postgres 15+. Mitigation: confirm the
  local + shared project version in Phase 0; if <15, wrap reads in
  `SECURITY INVOKER` SQL functions instead of views. (Supabase is 15+ by default.)
- **Double-sourced thresholds (RULES #17).** DB `settings` vs client `ENGAGEMENT`
  constant. Mitigation: `settings` is authoritative in live mode via
  `useSettings()`; the constant is the demo/default fallback only; `engagementFrom`
  is the single grouping function. A test asserts changing `settings` re-groups
  the queue.
- **Timezone (RULES #22).** `days_since`, Sunday bucketing, and week filters must
  use Asia/Manila. Mitigation: all day math in SQL uses `AT TIME ZONE
  'Asia/Manila'`; client date splitting uses `lib/format.ts`. Integration test
  R-days pins a known offset.
- **Stage-label mismatch (GAPS #27/#32).** Live DB may store 'Newbie' or 'New
  Friends'/'Schooling'. Mitigation: `fromDbStage` maps all known variants and
  throws on unknown (fail fast, surfaces drift before Phase 6); confirm the real
  CHECK via MCP `list_tables` in Phase 0.
- **N+1 / over-fetch.** Naive per-disciple queries on the list. Mitigation: the
  list/queue/admin all read the single `disciple_engagement` view (joins done in
  SQL); per-disciple queries (timeline/attendance/checklist) fire only on the
  profile/modal, keyed and cached by disciple id.
- **Timeline union performance.** Four `UNION ALL` sources. Mitigation: filtered
  by `disciple_id` (indexed) and only queried per open profile; acceptable at
  pilot scale (43 disciples). Revisit indexes if the pilot grows.
- **Missing Phase-1 columns.** `disciple_engagement`/`discipler_load` may lack
  `in_stage_since`/`days_since_last_log`, or `disciple_checklist_items` may lack
  `completed_at`/`item_text`. Mitigation: amend the Phase-1 migration (same
  family), not a new object; timeline `check` events degrade gracefully to empty
  until Phase 4 populates `completed_at`.
- **Demo/live drift.** Two fetch paths can diverge. Mitigation: shared return
  types + a parity test that runs the same mapper on both sources for one screen.

---

## 8. Rollback / safety

- **Frontend:** additive. Revert the `app/src/features/*`, `lib/supabase.ts`,
  `lib/query-client.ts`, `database.types.ts`, and the route edits; flip
  `VITE_DEMO_MODE=true` and the app returns to the fully-working prototype (the
  `store.tsx` seed path is untouched). No user data is affected.
- **Database:** the only new objects are `discipleship.disciple_timeline`,
  `discipleship.disciple_attendance(...)`, and any Phase-1 view column additions.
  Rollback = `DROP VIEW IF EXISTS discipleship.disciple_timeline;` and
  `DROP FUNCTION IF EXISTS discipleship.disciple_attendance(uuid, int);`. Because
  they are `SELECT`-only and additive, leaving them in place is also safe (they
  hold no state).
- **Tierra stays safe by construction:** no schema, policy, data, or column of
  `public.*` is modified in this phase — reads only. Disabling the Dokploy app or
  reverting the migration leaves the directory exactly as it was.
- **Production untouched:** Phase 3 runs against the **local** stack only. Nothing
  here is pushed to the shared project (`ncijotdkovijkcpqnlbv`) — that is Phase 6,
  gated on this suite being green.
</content>
</invoke>
