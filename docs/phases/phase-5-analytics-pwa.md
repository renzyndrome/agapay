# Phase 5 — Real analytics + PWA + polish

> Elaborates ROADMAP.md Phase 5. Locked architecture (NOTES.md): **Model 1** —
> `public.members` owns identity, stage, and discipler assignment; Agapay writes
> those two columns back only through `security definer` RPCs; everything
> behavioral lives in the `discipleship` schema; shared `auth.users` with Tierra.
>
> **Prime directive:** never modify Tierra's schema, policies, or data except
> `members.discipleship_stage` / `members.discipler_id` via the existing RPCs.
> Nothing in this phase writes to `public.*`. Every new object reads only.

---

## 1. Objective

After this phase Agapay is an **installable PWA** whose admin dashboard shows a
**stage-growth chart driven by real month-over-month stock** computed from
`discipleship.stage_transitions` (not the `STAGE_TREND_HISTORY` seed), every data
surface has explicit **loading / empty / error / offline** states with retry
affordances, and every displayed date, time, month bucket, and engagement-day
count is anchored to **Asia/Manila**. It adds zero new required user actions and
regresses none of the Phase 1–4 behavior.

## 2. Prerequisites

All must be green before starting:

- **Phase 0** — `supabase init`, Tierra baseline migration, local `supabase db reset`
  runs clean with `public.members` present; `.mcp.json` copied so the shared
  project (`ncijotdkovijkcpqnlbv`) is introspectable.
- **Phase 1** — `discipleship` schema live with: `stage_transitions` (audit rows
  written on promote and on disciple creation, NULL→stage; see GAPS #10, #29),
  `disciple_profiles` (member_id, enrolled_at, cohort), helpers
  `discipleship.current_member_id()` and `discipleship.is_agapay_admin()`, the
  `disciple_engagement` view, and the initial `stage_trend` view (this phase
  finalizes it to the chart contract). `supabase gen types --schema public,discipleship`
  compiles strict.
- **Phase 2** — real auth + role-scoped route guards; `/admin/*` reachable only by
  the admin role (the chart lives there).
- **Phase 3** — TanStack Query + Supabase client wired; per-feature `queryKeys.ts`;
  `app/src/features/*` structure exists; the admin dashboard reads live aggregates;
  `VITE_DEMO_MODE` gates the seed-store fallback.
- **Phase 4** — the `promote_disciple` RPC writes a `stage_transitions` row on every
  promotion (this is the data the trend chart aggregates; without it the trend is
  flat). `add_disciple` writes the intake NULL→stage transition.

Blockers to confirm before coding (carry-overs, do not silently assume):
GAPS #27/#32 stage-label mapping (`Newbie`↔`New Believer`) must already be applied
at the data boundary — the trend transform relies on it.

---

## 3. Work items

> Follow the four skills established in Phase 0: **migration** (any `supabase/migrations/*`
> change), **feature-slice** (client feature under `app/src/features/*`), **rls-check**
> (after the migration), **design-compare** (375px + 1280px screenshot pass).
> Prefer many small files (RULES / coding-style). Reference tokens, never raw hex
> (RULES #23).

### 3.1 — Finalize the `stage_trend` view + admin-guarded access RPC (DB)

**File:** `supabase/migrations/<timestamp>_discipleship_stage_trend.sql`
(new migration; `CREATE OR REPLACE` so it is idempotent over the Phase 1 stub).

**What it computes:** for each of the trailing **6 Asia/Manila months** and each
stage, the **stock** = number of enrolled, non-archived disciples whose stage
as-of the end of that month (or `now()` for the current, partial month) was that
stage. Stock — not per-month deltas — because the chart plots population per stage
over time (New Believer decreasing as disciples promote; Leader climbing), matching
the seed shape `New Believer 6→5→…`, `Leader 12→15→…`.

Stage as-of an instant = the `to_stage` of a disciple's latest `stage_transitions`
row at or before that instant. Bucketing and month boundaries are in Asia/Manila so
a promotion logged 2026-06-30 23:30 UTC (= 2026-07-01 07:30 Manila) lands in **July**.

```sql
-- discipleship.stage_trend: monthly per-stage stock, trailing 6 Manila months.
create or replace view discipleship.stage_trend
with (security_invoker = off) as        -- runs as owner; access is gated by the RPC below
with months as (
  select gs::date as m_start
  from generate_series(
    (date_trunc('month', now() at time zone 'Asia/Manila'))::date - interval '5 months',
    (date_trunc('month', now() at time zone 'Asia/Manila'))::date,
    interval '1 month'
  ) as gs
),
bounds as (
  select
    m_start,
    -- first instant of the *next* Manila month, as a timestamptz, clamped to now()
    least(
      ((m_start + interval '1 month')::timestamp) at time zone 'Asia/Manila',
      now()
    ) as as_of
  from months
),
stage_at as (
  select
    b.m_start,
    dp.member_id,
    (
      select st.to_stage
      from discipleship.stage_transitions st
      where st.member_id = dp.member_id
        and st.changed_at <= b.as_of
      order by st.changed_at desc
      limit 1
    ) as stage
  from discipleship.disciple_profiles dp
  join public.members m on m.id = dp.member_id and m.is_archived = false
  cross join bounds b
  where dp.enrolled_at <= b.as_of
)
select
  to_char(m_start, 'Mon')          as month_label,   -- 'Feb','Mar',… matches the chart
  m_start,
  stage,                                              -- 'Newbie' | 'Growing' | 'Leader' (DB values)
  count(*)::int                    as disciple_count
from stage_at
where stage is not null
group by m_start, stage
order by m_start, stage;
```

`stage_transitions.to_stage` stores Tierra DB values (`Newbie`/`Growing`/`Leader`);
the client transform maps `Newbie`→`New Believer` (§3.2). Keep the mapping at the
boundary — the view stays in DB vocabulary.

**Access path — admin-only, read-only RPC** (RULES #19: church-wide aggregates are
admin scope; a discipler must not read the whole church's trend even though it is
count-only):

```sql
create or replace function discipleship.stage_trend()
returns table (month_label text, m_start date, stage text, disciple_count int)
language plpgsql
security definer
set search_path = discipleship, public
as $$
begin
  if not discipleship.is_agapay_admin() then
    raise exception 'stage_trend is admin-only' using errcode = '42501';
  end if;
  return query
    select st.month_label, st.m_start, st.stage, st.disciple_count
    from discipleship.stage_trend st;   -- the view above
end;
$$;

revoke all   on function discipleship.stage_trend() from public, anon;
grant  execute on function discipleship.stage_trend() to authenticated;

revoke all on discipleship.stage_trend from anon, authenticated;  -- no direct view SELECT
```

The function only `SELECT`s. It never touches `public.*` for writes — prime directive
holds. Index support (create if absent from Phase 1):
`create index if not exists idx_stage_transitions_member_changed on discipleship.stage_transitions (member_id, changed_at desc);`

**Optional Phase-1 fix surfaced by the TZ audit (§3.5):** if `disciple_engagement`
computes "days since" as a raw `now() - last_at` interval, change it to a Manila
**calendar-day** difference so the queue does not flip a disciple across midnight:
`( (now() at time zone 'Asia/Manila')::date - (coalesce(last_at) at time zone 'Asia/Manila')::date )`.
Ship as the same migration only if the audit finds the drift; otherwise leave Phase 1
untouched.

### 3.2 — Analytics feature slice: wire the chart to real data

**Files (new, small, one concern each):**

- `app/src/features/analytics/queryKeys.ts` — `analyticsKeys = { stageTrend: ['analytics','stageTrend'] as const }`.
- `app/src/features/analytics/stage-trend.repo.ts` — `fetchStageTrend()` calls
  `supabase.rpc('stage_trend')` (schema `discipleship`), returns raw rows typed as
  `StageTrendRow[]`. Validate the array with a Zod schema (`stageTrendRowSchema`)
  at the boundary (coding-style: never trust external data).
- `app/src/features/analytics/stage-trend.transform.ts` — `toStageTrendHistory(rows)`
  pivots rows into the shape the existing `StageTrend` component already consumes,
  splitting the last month out as `current`:
  - group rows by `m_start` (ascending) → ordered month list;
  - map DB `stage` → display `Stage` via `dbStageToStage()` (`Newbie`→`New Believer`);
  - fill missing (stage, month) cells with `0`;
  - return `{ history: { months, counts }, current, currentMonthLabel }` where
    `history` is months 1..n-1 and `current`/`currentMonthLabel` is month n.
    This keeps the design-faithful `StageTrend` component (its CVD-safe direct
    labels, gold-600 Growing stroke, tooltip) unchanged.
- `app/src/features/analytics/use-stage-trend.ts` — `useStageTrend()` = `useQuery`
  with `queryKey: analyticsKeys.stageTrend`, `queryFn` = repo + transform,
  `staleTime` ~5 min (trend moves slowly), `enabled` only for the admin route.

**Edit:** `app/src/routes/admin/index.tsx` — replace the `STAGE_TREND_HISTORY` import
and static props with `useStageTrend()`. Render:
- `isPending` → `<CardSkeleton variant="chart" />` (§3.3), card geometry preserved;
- `isError` → `<QueryError onRetry={refetch} />`;
- success + empty (`months.length < 2`) → `<QueryEmpty>` copy: *"Not enough history
  yet — the growth chart fills in as disciples move through the stages."*;
- success → existing `<StageTrend history current currentMonthLabel />`.
Under `VITE_DEMO_MODE` the hook short-circuits to `STAGE_TREND_HISTORY` so the public
demo keeps working (NOTES / Phase 2 pattern). Delete no seed — it stays the demo source.

Change the card footer legend line from "from stage history" to accurate copy; keep
"All circles ·" prefix. Do not alter chart colors (RULES #2/#3).

### 3.3 — Shared query-state primitives (empty / error / offline / skeleton)

GAPS #16–#17: no loading/empty/error/offline states are designed. Build reusable,
token-styled, warm-copy primitives (RULES #12 no-guilt) once, in small files:

- `app/src/components/states/QueryError.tsx` — icon disc (Lucide `cloud-off`/`rotate-cw`,
  stroke 2), one warm line, and a **Retry** outline pill (`onRetry: () => void`,
  ≥44px). Copy: *"That didn't load. Give it another go?"* Never shows raw error text.
- `app/src/components/states/QueryEmpty.tsx` — `{ icon, title, hint }` props; reuses the
  queue-empty celebration geometry (56px green disc) when `tone="celebrate"`.
- `app/src/components/states/CardSkeleton.tsx` — shimmer blocks that follow card
  geometry per `variant` (`'chart' | 'list' | 'table' | 'tile' | 'kpi'`); animation
  120–360ms ease-out (RULES #16), no bounce.
- `app/src/components/states/OfflineBanner.tsx` — slim cream banner pinned under the
  header when offline: *"You're offline — showing the latest we have."* Uses status
  amber tint token; dismiss on reconnect.
- `app/src/lib/use-online-status.ts` — `useOnlineStatus()` seeds from `navigator.onLine`
  and subscribes to `window` `online`/`offline` events; returns `boolean`. SSR-safe
  guard (`typeof navigator`).

Wire `OfflineBanner` once in the shared layouts (`app/src/routes/_discipler.tsx` and
`app/src/routes/admin/route.tsx`) so it covers both role trees.

### 3.4 — Apply the three states to every query surface

Every TanStack Query surface must handle pending/empty/error, and degrade gracefully
offline (show cached data if present, else the offline/empty state — never a white
panel). Inventory (extends GAPS #16/#17; each row = one query, three states):

| Surface (route) | Query | Loading | Empty | Error |
|---|---|---|---|---|
| Discipler home queue (`_discipler/index`) | engagement queue | queue-card skeletons | existing "All caught up!" celebration | `QueryError` (retry) |
| This-week meetings (home + admin) | upcoming meetings | list skeleton | "No meetings scheduled this week." (exists) | `QueryError` |
| My Disciples (`_discipler/disciples.index`) | mine | list skeleton | "No disciples assigned yet." | `QueryError` |
| Disciple profile (`disciples.$id`) | profile + timeline | header + timeline skeleton | per-tab empty (checklist/meetings/milestones) | `QueryError` |
| Meetings tab (`_discipler/meetings`) | upcoming/past | list skeleton | per-filter empty ("Nothing upcoming." / "No past meetings.") | `QueryError` |
| Admin dashboard KPIs + stages | aggregates | `kpi`/`tile` skeleton | zero-safe (0 renders fine) | `QueryError` per card |
| Admin **stage-growth chart** | `useStageTrend` | `chart` skeleton | "Not enough history yet…" | `QueryError` (retry) |
| Admin Quest Circles / at-risk / discipler load | reads | list skeleton | existing "No one needs attention…" etc. | `QueryError` |
| Admin disciples table (`admin/disciples`) | filtered rows | table skeleton | "No disciples match these filters." | `QueryError` |
| Admin checklist mgmt (`admin/checklists`) | master items | list skeleton | "No items in this stage yet — add one below." | `QueryError` |

Skeletons must match card geometry (ROADMAP Phase 3). Keep all copy warm; banned
words (RULES #12) do not appear in any error/empty string.

### 3.5 — Asia/Manila timezone audit (RULES #22)

Server stores `TIMESTAMPTZ` (UTC). The prototype `format.ts` uses bare `new Date()`,
`.getMonth()`, `.getDate()`, `.getDay()` — the **runtime local** zone, which is wrong
for a traveling discipler or a non-Manila CI/build box, and mis-buckets rows near
midnight. Centralize the zone.

- `app/src/lib/tz.ts` (new): single source of truth.
  - `export const APP_TZ = 'Asia/Manila' as const`.
  - `nowInManila(): Date` — the current instant expressed as Manila wall-clock parts.
  - `manilaParts(iso: string)` — given a UTC ISO from Supabase, return `{ year, month,
    day, dow, hour, minute }` via `Intl.DateTimeFormat('en-PH', { timeZone: APP_TZ, … })`.
  - `manilaDaysSince(iso: string): number` — calendar-day difference in Manila
    (matches the server view fix in §3.1 so client and server agree).
  - `manilaMonthLabel(iso: string): string` — `'Jul'`.
  - `fmtTimeManila(iso)` → `"7:00 PM"` (12-hour, RULES #22); `fmtHeaderManila`, `fmtDowManila`.
- Refactor `app/src/lib/format.ts` to delegate its date/time formatters to `tz.ts`
  for values that originate from the server. Pure display helpers that take a
  `hh:mm` string (`fmtTime12`) stay, but any function that reads "now" or a stored
  timestamp routes through `APP_TZ`. `today()` becomes "today in Manila".
- Audit + fix call sites: `derive.ts` (`upcomingThisWeek` week window, engagement day
  math), `admin/index.tsx` (`currentMonthLabel` must be Manila), the 12-week Sunday
  attendance sparkline (GAPS #6 — bucket `sunday_service` activities into the last 12
  **Manila** Sundays), meeting date columns, timeline event dates, "N days ago" labels.
- Grep gate: `rg "new Date\(|getMonth\(|getDate\(|getDay\(|toLocale"` under
  `app/src` returns only `tz.ts` (and demo-only seed) after the audit.

### 3.6 — PWA: installable, offline shell, no push

Stack: **`vite-plugin-pwa`** (latest compatible with Vite 8) + `workbox-window`. No new
colors — manifest theming uses existing tokens (`#FBF5E9` cream, `#D81E2F` red).

**a. `app/vite.config.ts`** — add the plugin:

```ts
VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['assets/logo-mark.png', 'favicon.ico'],
  manifest: {
    name: 'Agapay — Quest Laguna',
    short_name: 'Agapay',
    description: 'Walk with your disciples — no one left behind.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FBF5E9',   // cream — splash matches the app bg
    theme_color: '#D81E2F',        // brand red — status bar / toolbar
    icons: [
      { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
    navigateFallback: '/index.html',   // SPA shell offline (mirrors nginx fallback)
    // Do NOT runtime-cache Supabase REST/auth — data + tokens must stay live.
    runtimeCaching: [
      // Optional: keep Google Fonts usable offline after first load (see 3.6d).
      { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
        handler: 'CacheFirst',
        options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60*60*24*365 } } },
    ],
  },
  devOptions: { enabled: false },   // keep the SW out of `vite dev`
})
```

Push notifications are intentionally out (v1 decision) — no `pushManager`, no
notification permission prompt anywhere.

**b. Icons** — `app/public/icons/pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png`,
plus `apple-touch-icon-180.png`. Generate **from the existing** `logo-mark.png`
(RULES #8: never redraw the mark — scaling/padding the PNG is allowed). Maskable =
the red mark centered on a cream `#FBF5E9` field with ≥20% safe-zone padding.
One-time generation via `@vite-pwa/assets-generator`:
`npx pwa-assets-generator --preset minimal-2023 app/public/assets/logo-mark.png`
(then move outputs to `app/public/icons/` and set the maskable background to cream).
Commit the PNGs. **Flag:** source mark is 105×105 — request a hi-res/vector mark from
the design lead for a crisp 512 (GAPS-style open item); interim upscale is acceptable
for install but note the softness.

**c. Registration** — `app/src/main.tsx`: `import { registerSW } from 'virtual:pwa-register'`
and `registerSW({ immediate: true })`. Add `virtual:pwa-register` and
`vite-plugin-pwa/client` to the TS env types (`app/src/vite-env.d.ts` or `env.d.ts`).
Remove the orphaned Create-TanStack placeholder `app/public/manifest.json` (its
`short_name` is "TanStack App"); the plugin now emits `manifest.webmanifest` and
injects the `<link rel="manifest">`. Add `<meta name="theme-color" content="#D81E2F">`
and an `apple-touch-icon` link to `app/index.html` (the plugin can inject; otherwise
add manually).

**d. Fonts offline** — `index.html` loads Poppins/Manrope from Google Fonts (remote).
First-load offline would render fontless. Preferred fix: **self-host** via
`@fontsource/poppins` + `@fontsource/manrope` (import the used weights, drop the
`<link>` to `fonts.googleapis.com`), which also removes a render-blocking request and
guarantees the shell renders offline. Minimal fallback if self-hosting is deferred:
keep the `CacheFirst` runtime rule in §3.6a (fonts survive **after** first online load).
Document whichever is chosen in NOTES.md.

**e. nginx headers** — `deploy/nginx.conf`: the SW and manifest must revalidate or the
`autoUpdate` never reaches installed clients. Add before the SPA fallback:

```nginx
location = /sw.js            { add_header Cache-Control "no-cache"; try_files $uri =404; }
location = /manifest.webmanifest { add_header Cache-Control "no-cache"; types { application/manifest+json webmanifest; } try_files $uri =404; }
location = /registerSW.js    { add_header Cache-Control "no-cache"; try_files $uri =404; }
```

`/icons/` may keep long-cache (stable filenames) via the existing hashed-asset rule or
its own immutable `location /icons/`. The existing `/assets/` immutable rule already
covers `logo-mark.png`.

### 3.7 — Verification & polish

- `design-compare` screenshot pass at 375px (discipler) and 1280px (admin) against
  `Agapay App.dc.html`; confirm chart, skeletons, empty/error/offline states, and the
  installed standalone frame match the cream identity.
- Lighthouse **PWA/Installable** audit passes (manifest valid, icons present, SW
  registered, HTTPS via Dokploy at discipleship.questlaguna.org).
- Standing checks (ROADMAP): `pnpm exec tsc --noEmit && pnpm lint && pnpm build` green;
  `supabase db reset` + seed clean; rls-check after the migration; NOTES/GAPS updated
  (close #16/#17 empty/offline; note fonts + icon-resolution decisions).

---

## 4. Interfaces & contracts

**DB / RPC**

```
-- View (owner-run building block)
discipleship.stage_trend  ->  (month_label text, m_start date, stage text, disciple_count int)

-- Client access path (SECURITY DEFINER, admin-guarded, read-only)
discipleship.stage_trend() RETURNS TABLE (month_label text, m_start date, stage text, disciple_count int)
  -- raises 42501 for non-admins; EXECUTE granted to `authenticated` only.
```

**TypeScript**

```ts
// app/src/features/analytics/stage-trend.repo.ts
export interface StageTrendRow {
  month_label: string          // 'Feb'
  m_start: string              // 'YYYY-MM-01' (date)
  stage: 'Newbie' | 'Growing' | 'Leader'   // DB vocabulary
  disciple_count: number
}
export function fetchStageTrend(): Promise<StageTrendRow[]>

// app/src/features/analytics/stage-trend.transform.ts
export interface StageTrendResult {           // feeds the existing <StageTrend/>
  history: StageTrendHistory                  // months 1..n-1  (from #/data/seed type)
  current: Record<Stage, number>              // month n live counts
  currentMonthLabel: string                   // 'Jul'
}
export function toStageTrendHistory(rows: StageTrendRow[]): StageTrendResult
export function dbStageToStage(v: StageTrendRow['stage']): Stage  // 'Newbie' -> 'New Believer'

// app/src/features/analytics/use-stage-trend.ts
export function useStageTrend(): UseQueryResult<StageTrendResult>

// app/src/lib/use-online-status.ts
export function useOnlineStatus(): boolean

// app/src/lib/tz.ts
export const APP_TZ = 'Asia/Manila'
export function manilaDaysSince(iso: string): number
export function manilaMonthLabel(iso: string): string
export function fmtTimeManila(iso: string): string
```

**Query keys** (per-feature convention): `analyticsKeys.stageTrend = ['analytics','stageTrend']`.

**Response envelope** — `useStageTrend` surfaces TanStack Query state
(`isPending | isError | data`); the repo returns Zod-validated rows or throws
(caller renders `QueryError`). No custom envelope wrapper is introduced (raw
Supabase `.rpc()` + Query state is the contract, per Phase 3).

**PWA** — Vite virtual modules: `virtual:pwa-register` (`registerSW`). Emitted
artifacts: `/manifest.webmanifest`, `/sw.js`, `/registerSW.js`, `/workbox-*.js`,
`/icons/*`.

---

## 5. Test plan

**Unit (vitest)**

- `tz.test.ts`:
  - `fmtTimeManila('2026-07-10T16:30:00Z')` → `'12:30 AM'` (Manila +8 → Jul 11 00:30);
    assert `manilaMonthLabel` of that ISO is `'Jul'`.
  - `manilaDaysSince` across a Manila midnight boundary returns the calendar-day
    count, not the raw 24h-interval floor.
  - Force `process.env.TZ=UTC` in the test runner and assert outputs are unchanged
    (proves independence from runner zone).
- `stage-trend.transform.test.ts`:
  - rows for 6 months × 3 stages pivot to `history.months.length === 5` + one
    `current`; `Newbie` rows map to `counts['New Believer']`; a missing (stage,month)
    cell fills `0`; month order ascends by `m_start`.
  - malformed row (missing `disciple_count`) → Zod throw (boundary validation).
- `use-online-status.test.tsx`: dispatch `offline`/`online` events → hook toggles.

**Integration (local Supabase + seed)**

- Seed a promotion history so `stage_transitions` spans ≥6 months; call
  `discipleship.stage_trend()` as admin → 6 distinct months, stock decreases for
  New Believer and increases for Leader (monotone with the seed), sums per month ≤
  enrolled disciple count.
- TZ boundary row: seed a transition at `2026-06-30T23:30:00Z`; assert it counts in
  the **July** bucket (Manila), not June.
- `add_disciple` intake (NULL→stage) appears from its enrolled month forward and not
  before (`enrolled_at <= as_of` clause).

**Access / RLS (rls-check skill)** — after the migration, with Phase-1 seeded users:

| Actor | Call | Expected |
|---|---|---|
| Ptr. Danilo (admin) | `supabase.rpc('stage_trend')` | **allow** — 6×≤3 rows |
| Alma (discipler, TRIBES) | `supabase.rpc('stage_trend')` | **deny** — `42501` "stage_trend is admin-only" |
| Josie (discipler) | direct `select * from discipleship.stage_trend` | **deny** — no view SELECT grant |
| anon (no session) | `rpc('stage_trend')` | **deny** — EXECUTE revoked from anon |
| Alma (discipler) | any write to `public.members` / `stage_transitions` | **deny** (unchanged from Phase 1/4 — regression check that this phase added no grants) |

Prime-directive regression: diff the migration — it contains only `create view`,
`create function`, `create index`, `grant/revoke`; **zero** statements target `public.*`
DDL/DML.

**E2E / manual (Playwright + device)**

- Admin dashboard: chart renders real month labels ending in the current Manila month;
  kill the network mid-load → `QueryError` with a working **Retry**.
- Install: Chrome/Android shows the install prompt; installed icon is the red mark;
  launch opens standalone (no browser chrome), portrait, cream splash.
- **Offline shell:** load app online once, enable airplane mode, hard-reload →
  the app shell renders (header + offline banner + cached data or empty states),
  **not** a white screen. Re-enable network → banner clears, queries refetch.
- No notification permission prompt is ever shown (push out of scope).

---

## 6. Exit gate

**Single testable condition:** `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
and the Docker image build are green; the app installs to a phone home screen and
launches standalone; an **airplane-mode hard-reload shows the app shell, not a white
screen**; and the admin stage-growth chart renders **real Asia/Manila month buckets
sourced from `discipleship.stage_trend()`** (verified by the integration + rls-check
scenarios in §5, including the June/July boundary row and the discipler-denied call).

---

## 7. Risks & mitigations

- **Tierra prime directive (highest).** A stray write to `public.*` or a policy change
  breaks the shared directory. *Mitigation:* every Phase-5 object is read-only
  (`view` + `SECURITY DEFINER` function that only `SELECT`s); the migration diff-review
  in §5 asserts no `public.*` DDL/DML; the RPC touches `members` only via read.
- **Stale service worker serving an old bundle** (classic PWA footgun). *Mitigation:*
  `registerType: 'autoUpdate'` + workbox `skipWaiting`/`clientsClaim` defaults + nginx
  `no-cache` on `sw.js`/`manifest.webmanifest`/`registerSW.js`; hashed assets stay
  immutable. Keep a kill-switch SW ready (§8).
- **Over-caching data/auth offline.** Caching Supabase REST or auth would serve stale
  rows or leak a stale session. *Mitigation:* `runtimeCaching` explicitly excludes
  Supabase; only the precached shell + (optional) Google Fonts are cached; live data
  fails to the offline/empty states.
- **Timezone drift** between server (UTC `TIMESTAMPTZ`) and client, and month-boundary
  mis-bucketing. *Mitigation:* one `APP_TZ` in `tz.ts`, server view buckets in
  Asia/Manila, matching `manilaDaysSince` client-side; boundary unit + integration
  tests; TZ-independence test with `TZ=UTC`.
- **Discipler reading church-wide aggregates** (RULES #19). *Mitigation:* admin-guarded
  RPC, view SELECT revoked from `authenticated`.
- **Icon resolution** — 105×105 source upscaled to 512 looks soft. *Mitigation:* ship
  the upscale to unblock install; log a design-lead ask for a hi-res/vector mark;
  never redraw the mark (RULES #8).
- **Fontless offline first paint.** *Mitigation:* self-host Poppins/Manrope (preferred)
  or `CacheFirst` the font hosts (fallback).
- **`vite-plugin-pwa` × Vite 8 compatibility** (Vite 8 is new here). *Mitigation:* pin
  the newest compatible release; `devOptions.enabled: false` isolates the SW from
  `vite dev`; verify a clean `pnpm build` before wiring registration.

## 8. Rollback / safety

- **PWA kill-switch.** If a bad SW ships, replace `sw.js` with a self-unregistering
  worker (`self.addEventListener('install', () => self.skipWaiting()); self.registration.unregister()`
  and clear caches) served `no-cache`; installed clients drop the SW on next load.
  Removing the `VitePWA` plugin + the `registerSW` call and deleting the emitted
  artifacts fully reverts to the pre-PWA SPA (nginx SPA fallback still serves routes).
- **Analytics rollback.** `drop function if exists discipleship.stage_trend();` and
  revert the view to the Phase-1 stub (`create or replace view … as select …`); both
  are additive and read-only, so dropping them is safe and Tierra is unaffected. The
  chart falls back to `STAGE_TREND_HISTORY` under `VITE_DEMO_MODE`.
- **States/TZ rollback.** The state primitives and `tz.ts` are additive modules; if the
  audit regresses a date display, revert `format.ts` to the prototype formatters
  (per-file git revert) without touching the DB.
- **What stays safe regardless:** no Tierra schema/policy/data changed; the
  `discipleship` schema stays additive and read-mostly; disabling the Dokploy app (or
  the SW) restores the exact prior behavior. Migrations reach production only via the
  Phase-6 path (`db push` after link, or a Supabase branch verify→merge) with the local
  suite green — never `apply_migration` straight to prod.
