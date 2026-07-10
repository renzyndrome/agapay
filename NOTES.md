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
  Tierra deployment screenshots): Apple Matabuena Eugenio (cell leader) = signed-in
  discipler persona, Judy Ann Ramos Bulao = second discipler, 21 disciples split
  between them. Real stage distribution kept (mostly Leader, 3 Growing → the live
  app's "Schooling"); engagement days invented to exercise the queue: 2 at-risk
  under Apple, 1 under Judy (Chelzeiy, 41d), Mary-Ann Caldoza carries a 2-meeting
  no-show streak, Judy is >14d since her own last log → "Inactive" chip.
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
