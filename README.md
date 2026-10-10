# Agapay — Quest Laguna discipleship monitoring

Agapay helps Quest Laguna disciplers walk with their disciples through three stages
(**New Believer → Growing → Leader**) so that *no disciple gets stagnant or forgotten*.
The heart of the app is the discipler's **follow-up queue** — a triage inbox you clear
to zero. Admins get a church-wide analytics dashboard across every Quest Circle.

**Live prototype:** https://discipleship.questlaguna.org

## Status

> **New session? Start with [`docs/HANDOFF.md`](docs/HANDOFF.md)** — current state,
> the decisions that aren't obvious from the code, and the gotchas worth not
> rediscovering.

| Layer | State |
|---|---|
| **Clickable prototype** (`app/`) | ✅ Live at discipleship.questlaguna.org — all 7 design screens, seeded data, role switcher instead of login |
| **Data layer** (`supabase/`) | ✅ **Applied to production** — 15 migrations, 8 RLS-protected tables, 4 views, 15 functions; verified by a **60-assertion RLS suite** |
| **Auth, read path, write path, analytics, PWA** | ✅ Built and verified; live mode is one env flag away |
| **Production data** | ✅ **174 disciples imported** across 42 disciplers; master checklists seeded |
| **Discipler logins** | ⏳ none yet — invite + link in the directory admin app (see [`docs/CUTOVER.md`](docs/CUTOVER.md)) |
| **Live deployment** | ⏳ the deployed site still serves the demo; set the `VITE_` vars in Dokploy to go live |

The app integrates with the existing **Tierra** church directory on a shared Supabase
project: the directory (`public.members`) owns identity, stage, and discipler
assignment; Agapay adds a `discipleship` schema for all activity/meeting/checklist data
and writes back to the directory only through locked-down RPCs. See
[`ROADMAP.md`](ROADMAP.md) and [`NOTES.md`](NOTES.md) for the full design and decisions.

---

## Run the prototype locally

Requires **Node 20.19+** (22 or 24 recommended) and **pnpm** (via corepack).

```bash
cd app
corepack enable          # first time only — provides pnpm
pnpm install
pnpm dev                 # → http://localhost:3000
```

The prototype is entirely in-memory: every interaction works, and a **browser refresh
resets everything to the seed**. Nothing to configure, nothing you can break.

---

## How to navigate (demo tour)

Open the app. The black bar at the top-right switches between **Discipler** and **Admin**
— this replaces login for the demo.

### Discipler view (mobile-first — Alma Mallari Estrada, TRIBES)

1. **Home / follow-up queue.** The progress ring shows how many check-ins are left.
   Disciples are grouped by urgency: **Quiet for a while** (red), **Cooling down**
   (amber), **Walking steady** (green avatars). Stat chips and this-week's meetings sit
   below; a scripture line closes the screen.
2. **Clear the queue.** On a *Quiet* card tap **Log** → a bottom sheet opens (type chips
   + date + optional note) → **Save activity**. A toast confirms, the disciple leaves
   the queue, and the ring fills. This is the 10-second core loop.
3. **Open a profile.** Tap a disciple (or **View**) → header with stage + engagement
   pills, a 12-week attendance sparkline, and tabs: **Timeline / Checklist / Meetings /
   Milestones**. Tick checklist items; they persist for the session.
4. **Promote.** On a New Believer / Growing profile, **Promote to …** opens a modal that
   *requires a note* (Confirm stays disabled until you type one) — the note becomes part
   of the audit trail and the checklist resets to the new stage.
5. **Schedule + meetings.** Use **Schedule** (from a card or profile) to open the meeting
   sheet. The **Meetings** tab lists Upcoming/Past; on an upcoming card use **Done**
   (adds notes, resets engagement), **Cancel**, or **No-show**.
6. **Tabs:** Home / Disciples / Meetings along the bottom.

### Admin view (desktop — Ptr. Danilo Olivares)

Switch to **Admin** (top-right). Left sidebar: **Dashboard / Disciples / Checklists**.

1. **Dashboard.** KPI tiles → stage cards (count + % + share bar) → **stage-growth line
   chart** (hover any month for the per-stage tooltip) → engagement-health breakdown →
   **Quest Circles** (TRIBES / CHOSEN GENERATION / SOULDIERS, each with its own
   engagement bar) → at-risk list → discipler load (note the red **Inactive** chip).
   Filter the whole page by **Quest Circle** and **cohort** (top-right).
2. **Click any disciple** — in the at-risk list or the disciples table — to open a
   **detail modal** (same Timeline/Checklist/Meetings/Milestones tabs). Deep-link:
   `/admin/disciples?disciple=d1`.
3. **Disciples table.** Filter by search / stage / engagement / discipler / circle /
   cohort. Tick row checkboxes to reveal the black **bulk-reassign** bar → pick a
   discipler → **Apply**.
4. **Checklists.** Stage tabs; drag rows to reorder; add or remove items.

---

## How to test

### 1. App quality gates (fast, no setup)

```bash
cd app
pnpm exec tsc --noEmit    # strict typecheck
pnpm lint                 # eslint
pnpm test                 # 20 tests — role resolution, guards, demo mutations
pnpm build                # production build
```

`pnpm test` covers the auth logic in [`src/lib/auth.ts`](app/src/lib/auth.ts): who counts
as a discipler, where each role lands, who may enter which route tree, and that no
staff role (finance/registration/satellite) leaks into Agapay.

### 2. Demo mode — the prototype (default)

```bash
cd app && pnpm dev        # → http://localhost:3000
```

No credentials needed. The black top bar switches Discipler ↔ Admin, data is seeded
in-memory, and a refresh resets everything. This is exactly what
discipleship.questlaguna.org serves.

### 3. Live auth mode — real Supabase login

Copy [`.env.example`](.env.example) to `.env`, fill in `VITE_SUPABASE_URL` +
`VITE_SUPABASE_ANON_KEY`, and set `VITE_DEMO_MODE=false`. Then `pnpm dev`.

| Try this | Expected |
|---|---|
| Visit `/` or `/admin` signed out | Redirected to the login screen |
| Sign in with the **admin** account | Lands on `/admin` |
| Sign in with a non-admin account that disciples nobody | Warm `/no-access` page, not an error |
| Sign in as someone with ≥1 assigned disciple | Lands on the follow-up queue |
| Wrong password | "That email and password did not match." |
| **Sign out** (top bar) | Back to the login screen |

Role resolution reads only tables that already exist in the directory
(`user_profiles` + `members.discipler_id`). Against production you will see the
**real 174 disciples** — the read and write paths are wired.

A discipler also needs `user_profiles.member_id` linked to their member record;
that is done in the directory admin app (`/admin/users`), not by Agapay. Without
it they land on a friendly "Almost there" screen. See [`docs/CUTOVER.md`](docs/CUTOVER.md).

> A discipler is whoever another member points at via `members.discipler_id` — no
> `'discipleship'` role grant needed. That is deliberate: see
> [`design/GAPS.md`](design/GAPS.md) #33.

### 4. Data-layer RLS suite

Requires **Docker**. This proves the security-critical properties of the `discipleship`
schema against a throwaway Postgres with a faithful Supabase-auth shim — it never touches
the shared production database and tears the container down when done.

```bash
bash test/rls/run.sh          # 60 assertions; prints PASS/FAIL, exits non-zero on any fail
KEEP=1 bash test/rls/run.sh   # leave the container up to poke at it
```

It loads the auth shim → every migration in `supabase/migrations/` → a test seed, then
asserts: cross-discipler read isolation, the engagement view respecting RLS, the
**personal-touch clock** (a Sunday check-in must *not* silence the queue), the
**12-week attendance sparkline** over the QR check-in module, the Tierra prime directive
(disciplers cannot write `members` directly — only via RPC), append-only activity logs,
the promote / reassign / add-disciple RPC guards, the DB↔UI stage mapping, the implicit
discipler RBAC model, RLS-on-every-table, and anon lockout.

The suite publishes no host port and tears its container down afterwards, so it is safe
to run on a machine hosting other services. If Postgres cannot start it aborts loudly
rather than reporting bogus failures.

---

## Deploy (Dokploy + Docker)

The prototype ships as a static SPA served by nginx (multi-stage [`Dockerfile`](Dockerfile),
build context = repo root, container port **80**, SPA fallback for client routes).

In Dokploy: create an **Application** from this repo, Build Type **Dockerfile**, add the
domain `discipleship.questlaguna.org` on container port 80 with Let's Encrypt, and
deploy. No environment variables are needed for the prototype. Full step-by-step lives in
the conversation history / [`ROADMAP.md`](ROADMAP.md) Phase 6.

---

## Project layout

```
app/                     Clickable prototype (TanStack Router + React 19 + Tailwind v4)
  src/routes/            File-based routes: _discipler/* (mobile), admin/* (desktop)
  src/components/        UI primitives, sheets, charts, disciple detail, admin modal
  src/data/seed.ts       Seeded people & Quest Circles (from the live TRIBES data)
  src/lib/               engagement thresholds, stage vocab, derivations, formatting
  src/store.tsx          In-memory store; all mutations isolated for the Supabase swap
supabase/migrations/     Tierra baseline + 10 discipleship_* migrations (RLS beside each)
test/rls/                Supabase-auth shim, seed, and run.sh (30-assertion RLS suite)
deploy/nginx.conf        SPA server config
docs/phases/             Per-phase implementation specs + consistency review + index
ROADMAP.md               7-phase execution plan (prototype → production)
NOTES.md                 Decision log
design/                  Design handoff (source of truth), INVENTORY.md, GAPS.md
CLAUDE.md                Product/domain rules
```

## Documentation map

- [`ROADMAP.md`](ROADMAP.md) — the phased plan from prototype to production cutover.
- [`docs/phases/README.md`](docs/phases/README.md) — phase index, consistency review,
  and the reconciliation directive (Phase 1 as-built is the contract).
- [`NOTES.md`](NOTES.md) — chronological decision log.
- [`design/GAPS.md`](design/GAPS.md) — open questions and prototype↔spec mismatches.
- [`CLAUDE.md`](CLAUDE.md) — domain vocabulary and non-negotiable product behaviors.
