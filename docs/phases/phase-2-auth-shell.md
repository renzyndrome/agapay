# Phase 2 — Auth + role shell

> Elaborates ROADMAP.md § "Phase 2 — Auth + role shell" (½–1 day). Read alongside
> CLAUDE.md (product/domain rules), NOTES.md (locked decisions), RULES.md (design
> rules), and `design/GAPS.md` #15/#26/#29. This phase replaces the prototype's
> role-switcher with real Supabase login while keeping the public demo working
> underneath a flag.
>
> **Prime directive (all phases):** never modify Tierra's schema, policies, or data
> except `members.discipleship_stage` / `members.discipler_id` via the Phase-1
> `security definer` RPCs (plus minimal-member inserts). Phase 2 adds **only one**
> DB object — a read-only `public.agapay_my_profile()` function — and touches no
> Tierra table, column, policy, or trigger.

---

## 1. Objective

After this phase the app authenticates real people against the shared Supabase
project (`ncijotdkovijkcpqnlbv`) with email + password, looks up their Agapay role
in `discipleship.profiles`, and lands them on the correct tree (admin → `/admin`,
discipler → `/`) with route guards protecting both trees and a working sign-out.
The clickable prototype keeps running unchanged behind `VITE_DEMO_MODE=true`, so
the public demo at `discipleship.questlaguna.org` is never broken while the real
app grows underneath it. No real data is wired yet (that is Phase 3); this phase
proves **identity and routing** only.

## 2. Prerequisites

Must be complete and green before starting:

- **Phase 0 — Foundations.** `supabase init` done; local stack boots
  (`supabase start`); Tierra baseline migration present and marked already-applied
  on remote; `.env.example` has `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`;
  `.mcp.json` present (Supabase MCP → project `ncijotdkovijkcpqnlbv`); the four
  skills exist in `.claude/skills/` (migration, feature-slice, rls-check,
  design-compare).
- **Phase 1 — Discipleship schema.** Specifically depended on:
  - `discipleship.profiles` exists with columns `user_id uuid PK → auth.users(id)`,
    `member_id uuid → public.members(id)`, `role text CHECK (role IN ('admin','discipler'))`,
    `created_at`, `updated_at`; RLS grants each user SELECT on their own row.
  - Helpers `discipleship.current_member_id()` and `discipleship.is_agapay_admin()`
    exist (used by the RPC and by later-phase RLS).
  - Seed provisions **auth users** for the five personas with matching `profiles`
    and `members` rows: Alma Mallari Estrada, Josie Lyn Rivera Baluyot, Gina Dimalanta
    Valencia, Rodel II Sarmiento Magbanua = `role='discipler'`; **Ptr. Danilo
    Olivares = `role='admin'`**. Emails/passwords for local login are recorded in the
    seed SQL header.
  - `supabase gen types --schema public,discipleship` compiles strict.
- **Repo.** Add runtime dependency `@supabase/supabase-js` (`^2`) to `app/package.json`
  (`pnpm add @supabase/supabase-js`). This is the canonical client for the locked
  Supabase architecture — not a new stack choice.

> If Phase 1 chose to expose the `discipleship` schema to PostgREST
> (`[api].schemas = ["public","discipleship"]` in `supabase/config.toml`), the
> profile read can also be a direct `.schema('discipleship').from('profiles')`
> select. Phase 2 still ships the `public.agapay_my_profile()` RPC as the stable
> client contract so we do **not** depend on that exposure and keep the read
> surface minimal.

## 3. Work items

Ordered. Follow repo conventions: many small files under `app/src/features/*` and
`app/src/lib/*`; DB work under `supabase/migrations/*`; TanStack file routes under
`app/src/routes/*`; import alias `#/*` → `app/src/*`.

### 3.1 Env + config + Supabase client

**Files:** `.env.example` (edit), `app/src/lib/config.ts` (new), `app/src/lib/supabase.ts` (new).

- `.env.example` — add the demo flag (default on for the public demo build):

  ```dotenv
  VITE_SUPABASE_URL=
  VITE_SUPABASE_ANON_KEY=
  # true = public prototype (role-switcher bar, no auth). false/unset = real login.
  VITE_DEMO_MODE=true
  ```

- `app/src/lib/config.ts` — typed, validated env access. `DEMO_MODE` parses the
  string flag; Supabase creds are only required when **not** in demo mode
  (fail-fast with a clear message, per coding-style "validate at boundaries").

  ```ts
  const raw = import.meta.env

  export const DEMO_MODE = raw.VITE_DEMO_MODE === 'true'

  export const SUPABASE_URL = raw.VITE_SUPABASE_URL as string | undefined
  export const SUPABASE_ANON_KEY = raw.VITE_SUPABASE_ANON_KEY as string | undefined

  export function requireSupabaseEnv(): { url: string; anonKey: string } {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        'Supabase env missing: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or run with VITE_DEMO_MODE=true).',
      )
    }
    return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY }
  }
  ```

- `app/src/lib/supabase.ts` — lazy singleton browser client. In demo mode it is
  never constructed, so a demo build needs no creds. The anon key is public-safe
  (RLS enforced); never reference the service-role key in client code.

  ```ts
  import { createClient, type SupabaseClient } from '@supabase/supabase-js'
  import { requireSupabaseEnv } from '#/lib/config'

  let client: SupabaseClient | null = null

  export function getSupabase(): SupabaseClient {
    if (client) return client
    const { url, anonKey } = requireSupabaseEnv()
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
    return client
  }
  ```

### 3.2 DB migration — read-only profile RPC

**File:** `supabase/migrations/<timestamp>_agapay_my_profile.sql`
(create with `supabase migration new agapay_my_profile`).

The one DB artifact this phase adds. It lives in `public` (already exposed to
PostgREST), reads the caller's own Agapay profile plus their directory display
name, and is **read-only** — no DML, `stable`, `SECURITY DEFINER`, EXECUTE granted
to `authenticated` only. Returns 0 rows for anon callers and for authenticated
Tierra users who have no Agapay profile (→ "no access").

```sql
create or replace function public.agapay_my_profile()
returns table (role text, member_id uuid, display_name text)
language sql
security definer
set search_path = public, discipleship
stable
as $$
  select p.role, p.member_id, m.name as display_name
  from discipleship.profiles p
  left join public.members m on m.id = p.member_id
  where p.user_id = auth.uid();
$$;

revoke all on function public.agapay_my_profile() from public, anon;
grant execute on function public.agapay_my_profile() to authenticated;

comment on function public.agapay_my_profile() is
  'Agapay Phase 2: returns the calling user''s Agapay role + directory display name. Read-only, self-scoped via auth.uid(). Never writes Tierra.';
```

Down / rollback: `drop function if exists public.agapay_my_profile();` (nothing
else changes). Regenerate types afterward:
`supabase gen types typescript --schema public,discipleship > app/src/lib/database.types.ts`.

### 3.3 Auth domain (pure logic + queries)

**Files:** `app/src/features/auth/types.ts`, `roleRedirect.ts`, `queries.ts`, `guards.ts` (all new).

- `types.ts` — the role/profile/snapshot contracts (see § 4). Keep string-literal
  unions, no `enum` (repo/TS rules).
- `roleRedirect.ts`:

  ```ts
  import type { AgapayRole } from '#/features/auth/types'
  export function roleHome(role: AgapayRole): '/admin' | '/' {
    return role === 'admin' ? '/admin' : '/'
  }
  ```

- `queries.ts` — the single network read for the profile. Plain async fn in this
  phase (TanStack Query wiring lands Phase 3); the query-key shape is defined now
  for forward-compat.

  ```ts
  import { getSupabase } from '#/lib/supabase'
  import type { AuthProfile } from '#/features/auth/types'

  export const authKeys = { profile: (userId: string) => ['auth', 'profile', userId] as const }

  export async function fetchMyProfile(userId: string): Promise<AuthProfile | null> {
    const { data, error } = await getSupabase().rpc('agapay_my_profile')
    if (error) throw error
    const row = data?.[0]
    if (!row || (row.role !== 'admin' && row.role !== 'discipler')) return null
    return { userId, memberId: row.member_id ?? null, role: row.role, displayName: row.display_name ?? null }
  }
  ```

- `guards.ts` — pure functions the layout `beforeLoad`s call. No React, no I/O;
  100% unit-testable (see § 5). They return a `redirect(...)` to throw, or
  `undefined` to allow. `AuthSnapshot` is always settled (never `loading`) because
  the app blocks render until the initial session resolves (§ 3.5).

  ```ts
  import { redirect } from '@tanstack/react-router'
  import type { AuthSnapshot } from '#/features/auth/types'
  import { roleHome } from '#/features/auth/roleRedirect'

  const toLogin = (href: string) => redirect({ to: '/login', search: { redirect: href } })

  export function guardDiscipler(auth: AuthSnapshot, href: string) {
    if (auth.mode === 'demo') return
    if (auth.status === 'signedIn')
      return auth.profile.role === 'admin' ? redirect({ to: '/admin' }) : undefined
    throw toLogin(href) // signedOut | noAccess
  }

  export function guardAdmin(auth: AuthSnapshot, href: string) {
    if (auth.mode === 'demo') return
    if (auth.status === 'signedIn')
      return auth.profile.role === 'admin' ? undefined : redirect({ to: '/' })
    throw toLogin(href)
  }

  export function guardPublicOnly(auth: AuthSnapshot) {
    // login route: bounce already-authenticated / demo users away
    if (auth.mode === 'demo') return redirect({ to: '/' })
    if (auth.status === 'signedIn') return redirect({ to: roleHome(auth.profile.role) })
    return undefined // signedOut | noAccess → stay and show the form (noAccess shows a note)
  }
  ```

  > Guards that must divert an *allowed-but-wrong-tree* user `return` a redirect
  > (the caller throws it); guards that reject an unauth user `throw` directly.
  > Keep the two-place invariant: **layout guards are the only place that pushes
  > unauth in; the login guard is the only place that pushes signed-in users out.**
  > This prevents redirect loops.

### 3.4 Auth provider + hooks + sign-out

**Files:** `app/src/features/auth/AuthProvider.tsx`, `useAuth.ts`, `signOut.ts`, `SignOutButton.tsx` (all new).

- `AuthProvider.tsx` — owns the session lifecycle and exposes `AuthLiveState`
  (snapshot + a `loading` state used only during first resolve). In **demo mode**
  it short-circuits to `{ mode: 'demo' }` and never constructs the client. In live
  mode: `getSupabase().auth.getSession()` on mount, subscribe to
  `onAuthStateChange`, and on any session presence resolve the profile via
  `fetchMyProfile(session.user.id)`.

  ```ts
  // shape (skeleton)
  type Internal =
    | { mode: 'live'; status: 'loading' }
    | AuthSnapshot // demo | live: signedOut | noAccess | signedIn

  // demo: value = { mode: 'demo' }
  // live mount:
  //   session = await getSupabase().auth.getSession()
  //   if !session -> { mode:'live', status:'signedOut' }
  //   else profile = await fetchMyProfile(uid)
  //        profile ? { mode:'live', status:'signedIn', userId, email, session, profile }
  //                : { mode:'live', status:'noAccess', userId, email }
  //   subscribe: onAuthStateChange((_e, session) => re-run the resolve above)
  //   unsubscribe on unmount
  ```

- `useAuth.ts` — `export function useAuth(): AuthLiveState` reading the context;
  throws if used outside the provider (mirror `useStore`).
- `signOut.ts`:

  ```ts
  import { getSupabase } from '#/lib/supabase'
  // AuthProvider's onAuthStateChange fires SIGNED_OUT -> snapshot becomes signedOut
  // -> router.invalidate() -> layout guard redirects to /login. No manual navigate needed.
  export async function signOut(): Promise<void> {
    await getSupabase().auth.signOut()
  }
  ```

- `SignOutButton.tsx` — small token-styled control (lucide `LogOut`, maroon icon,
  cream/outline per INVENTORY "round icon button" / "outline pill"). Renders
  `null` in demo mode. Warm label: "Sign out".

### 3.5 Router-context wiring + splash

**Files:** `app/src/routes/__root.tsx` (edit), `app/src/main.tsx` (edit),
`app/src/router.tsx` (edit), `app/src/features/auth/AuthSplash.tsx` (new).

- Convert the root route to carry auth in router context so `beforeLoad` guards can
  read it (idiomatic TanStack pattern; see AGENTS.md intent
  `router-core/auth-and-guards`):

  ```ts
  // __root.tsx
  import { createRootRouteWithContext } from '@tanstack/react-router'
  import type { AgapayRouterContext } from '#/features/auth/types'
  export const Route = createRootRouteWithContext<AgapayRouterContext>()({ component: RootComponent })
  ```

- `RootComponent` renders the **prototype role-switcher bar only when
  `DEMO_MODE`** (wrap the existing sticky black bar in `if (DEMO_MODE)`); in live
  mode it renders just `<StoreProvider><Outlet/><Toast/></StoreProvider>` (the
  demo bar disappears; each shell supplies its own chrome + sign-out).
- `main.tsx` — wrap the app in `<AuthProvider>` and inject the resolved snapshot as
  router context; block on a branded splash until the first resolve so guards never
  see `loading` and no redirect flicker occurs:

  ```tsx
  function InnerApp() {
    const auth = useAuth()
    useEffect(() => { router.invalidate() }, [auth]) // re-run beforeLoad on session change
    if (auth.mode === 'live' && auth.status === 'loading') return <AuthSplash />
    return <RouterProvider router={router} context={{ auth }} />
  }
  // root.render(<AuthProvider><InnerApp/></AuthProvider>)
  ```

- Both routers (`createRouter` in `main.tsx` and `getRouter()` in `router.tsx`)
  must supply a default `context` to satisfy the now-non-empty context type, e.g.
  `context: { auth: { mode: 'live', status: 'signedOut' } }` (overridden by the
  `<RouterProvider context>` prop). Keep `router.tsx` in sync so `tsc` stays green.
- `AuthSplash.tsx` — cream background, logo mark, quiet "Loading…" (Manrope,
  muted ink). No new colors; tokens only.

### 3.6 Login route + form

**Files:** `app/src/routes/login.tsx` (new), `app/src/features/auth/LoginForm.tsx` (new).

- `login.tsx` — file route `/login`, with a search schema and the public-only
  guard:

  ```ts
  export const Route = createFileRoute('/login')({
    validateSearch: (s: Record<string, unknown>): { redirect?: string } =>
      ({ redirect: typeof s.redirect === 'string' ? s.redirect : undefined }),
    beforeLoad: ({ context }) => { const r = guardPublicOnly(context.auth); if (r) throw r },
    component: LoginPage,
  })
  ```

- `LoginForm.tsx` — token-styled email + password form (INVENTORY §2 form field:
  44px, radius 12, cream bg, 1.5px `--color-cream-border`, Manrope 600 13px;
  primary red pill 48px with red-glow for "Sign in"; logo mark header; optional
  scripture footer per copy rules). On submit:
  `getSupabase().auth.signInWithPassword({ email, password })`.
  - Validate inputs before the call (non-empty email matching a basic email
    pattern, non-empty password); disable the button while pending.
  - On success: AuthProvider's `onAuthStateChange` resolves the snapshot; the
    login `beforeLoad` then redirects to `search.redirect ?? roleHome(role)`.
    Trigger re-evaluation with `router.invalidate()` (already wired in `InnerApp`
    via the `auth` effect) or `navigate({ to: search.redirect ?? '/' })` after the
    snapshot flips — prefer letting the guard drive it.
  - On failure: surface a warm, non-leaky inline message ("That email and password
    didn't match. Try again." — never echo which field was wrong; no guilt tone).
  - `noAccess` snapshot (authenticated but no Agapay profile): show a friendly
    "You don't have Agapay access yet — ask your leader" note and a sign-out link,
    rather than looping into a protected tree.

### 3.7 Guards on both trees

**Files:** `app/src/routes/_discipler.tsx` (edit), `app/src/routes/admin/route.tsx` (edit).

Add `beforeLoad` to each layout route; components stay unchanged.

```ts
// _discipler.tsx
export const Route = createFileRoute('/_discipler')({
  beforeLoad: ({ context, location }) => { const r = guardDiscipler(context.auth, location.href); if (r) throw r },
  component: DisciplerLayout,
})

// admin/route.tsx
export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context, location }) => { const r = guardAdmin(context.auth, location.href); if (r) throw r },
  component: AdminLayout,
})
```

### 3.8 Sign-out UI placement

**Files:** `app/src/routes/admin/route.tsx` (edit), `app/src/routes/_discipler/index.tsx` (edit).

- Admin: add `<SignOutButton />` to the sidebar identity block footer (next to
  `{adminName}` / "Quest Laguna leadership").
- Discipler: add `<SignOutButton />` (icon size) into the Home header card
  (near the initials avatar). Renders `null` in demo mode, so the prototype is
  visually unchanged.

### 3.9 Regenerate routes + standing verification

- `cd app && pnpm generate-routes` (updates `routeTree.gen.ts` for the new
  `/login` route).
- Standing gate (ROADMAP §"Standing verification"):
  `pnpm exec tsc --noEmit && pnpm lint && pnpm build` green.
- Run the `rls-check` skill for the new RPC (§ 5 scenarios).
- Screenshot the login page at 375px against the design tokens (design-compare).

## 4. Interfaces & contracts

**Types — `app/src/features/auth/types.ts`:**

```ts
import type { Session } from '@supabase/supabase-js'

export type AgapayRole = 'admin' | 'discipler'

export interface AuthProfile {
  userId: string
  memberId: string | null      // → public.members(id); null only for a not-yet-linked admin
  role: AgapayRole
  displayName: string | null   // from public.members.name
}

// Settled snapshot placed into router context (never 'loading').
export type AuthSnapshot =
  | { mode: 'demo' }
  | { mode: 'live'; status: 'signedOut' }
  | { mode: 'live'; status: 'noAccess'; userId: string; email: string }
  | { mode: 'live'; status: 'signedIn'; userId: string; email: string; profile: AuthProfile; session: Session }

// What useAuth() returns (adds the pre-resolve loading state).
export type AuthLiveState = AuthSnapshot | { mode: 'live'; status: 'loading' }

// Router DI context.
export interface AgapayRouterContext { auth: AuthSnapshot }
```

**RPC contract (server → client):**

- `public.agapay_my_profile()` → `setof (role text, member_id uuid, display_name text)`.
- Client call: `getSupabase().rpc('agapay_my_profile')` →
  `{ data: Array<{ role: string; member_id: string | null; display_name: string | null }>, error }`.
- 0 rows ⇒ no Agapay profile (`noAccess`); self-scoped via `auth.uid()` — a caller
  can never read another user's row.

**Supabase auth surface used:** `auth.getSession()`,
`auth.signInWithPassword({ email, password })`, `auth.signOut()`,
`auth.onAuthStateChange((event, session) => …)`.

**Query keys (forward-compat, consumed in Phase 3):**
`authKeys.profile(userId) = ['auth', 'profile', userId] as const`.

**Route search contract:** `/login` accepts `{ redirect?: string }`; guards write
it (`redirect: location.href`) and the login `beforeLoad` reads it to bounce the
user to their intended destination after sign-in.

**Config contract — `app/src/lib/config.ts`:** `DEMO_MODE: boolean`,
`SUPABASE_URL?: string`, `SUPABASE_ANON_KEY?: string`,
`requireSupabaseEnv(): { url; anonKey }`.

## 5. Test plan

Run each check locally against the seeded stack (`supabase db reset` + Phase-1 seed).

### 5.1 Unit — pure guards & helpers (Vitest; `@testing-library/react` already present)

`app/src/features/auth/guards.test.ts` — table-driven over `AuthSnapshot`:

| Snapshot | `guardDiscipler` | `guardAdmin` | `guardPublicOnly` |
|---|---|---|---|
| `{mode:'demo'}` | allow (undefined) | allow | redirect `/` |
| live `signedOut` | throw → `/login?redirect=…` | throw → `/login` | allow (show form) |
| live `noAccess` | throw → `/login` | throw → `/login` | allow (show note) |
| live `signedIn` role `discipler` | allow | redirect `/` | redirect `/` |
| live `signedIn` role `admin` | redirect `/admin` | allow | redirect `/admin` |

Also unit-test `roleHome('admin') === '/admin'`, `roleHome('discipler') === '/'`,
and `config` demo-flag parsing (`'true'` → true; unset/`'false'` → false).

### 5.2 Integration — auth flow with a mocked client

`app/src/features/auth/AuthProvider.test.tsx` — inject a fake `getSupabase()`
(mock `auth.getSession` / `signInWithPassword` / `onAuthStateChange`) and a fake
`agapay_my_profile` response:

- `getSession` returns a session + profile `discipler` ⇒ snapshot `signedIn`,
  role `discipler`.
- `signInWithPassword` error ⇒ `LoginForm` renders the warm inline error; snapshot
  stays `signedOut`.
- session present but `agapay_my_profile` returns `[]` ⇒ snapshot `noAccess`.
- fire `onAuthStateChange('SIGNED_OUT', null)` ⇒ snapshot `signedOut`.

### 5.3 RLS / DB — `rls-check` skill scenarios for the RPC

Sign in as each seeded user (JWT for `auth.uid()`), call the RPC, assert rows:

| Seeded user | Query | Expected |
|---|---|---|
| **Ptr. Danilo Olivares** (admin) | `select * from public.agapay_my_profile()` | 1 row, `role='admin'`, `member_id`=Danilo's member |
| **Alma Mallari Estrada** (discipler) | `select * from public.agapay_my_profile()` | 1 row, `role='discipler'`, `member_id`=Alma's member, `display_name='Alma Mallari Estrada'` |
| **anon / no JWT** | `select * from public.agapay_my_profile()` | 0 rows (`auth.uid()` null) |
| Authenticated **Tierra-only member** (no `discipleship.profiles` row) | `select * from public.agapay_my_profile()` | 0 rows → drives `noAccess` |
| **Alma** while probing scope | RPC never returns Josie's row | only Alma's row (self-scoped) |
| Prime-directive check | RPC + full Phase-2 migration | **no INSERT/UPDATE/DELETE against any `public.*` (Tierra) table**; `agapay_my_profile` is `stable`/read-only; EXECUTE granted to `authenticated` only, revoked from `anon`/`public` |

### 5.4 e2e — redirect matrix (Playwright; live build `VITE_DEMO_MODE=false`)

`app/e2e/auth.spec.ts`:

1. Unauthenticated GET `/` → redirected to `/login`.
2. Unauthenticated GET `/admin` → `/login`.
3. Login as **Alma** → lands on `/` (discipler shell), follow-up queue visible.
4. As Alma, navigate to `/admin` → redirected to `/`.
5. Sign out → `/login`; revisit `/` → `/login` (session cleared).
6. Login as **Ptr. Danilo** → lands on `/admin`; navigate to `/` → `/admin`.
7. Wrong credentials → warm inline error, stays on `/login`.
8. **Demo build** (`VITE_DEMO_MODE=true`): GET `/login` → `/`; role-switcher bar
   present; no auth required; prototype unchanged.

## 6. Exit gate

**Single testable condition:** on a `VITE_DEMO_MODE=false` build served against the
seeded local stack, the Playwright redirect-matrix (§ 5.4 cases 1–7) passes green —
i.e. unauthenticated visits redirect to `/login`; **Alma** lands on the discipler
follow-up queue and is bounced from `/admin` back to `/`; **Ptr. Danilo** lands on
`/admin` and is bounced from `/` back to `/admin`; sign-out returns to `/login` and
clears the session; wrong credentials keep the user on `/login` with a friendly
error — **with `pnpm exec tsc --noEmit && pnpm lint && pnpm build` green and the
§ 5.3 `agapay_my_profile()` rls-check scenarios returning the expected rows.**

> Scope note: "Alma sees only TRIBES-assigned disciples" is proven at the **data**
> layer by Phase-1 RLS + the Phase-3 read path. In Phase 2 the discipler shell
> still renders the demo store (Alma is the seeded persona, so the visible queue
> is already TRIBES). Phase 2's gate asserts **identity + routing**; the
> identity→data binding is a Phase-3 gate. This is called out honestly rather than
> claimed here.

## 7. Risks & mitigations

- **Tierra-safety (prime directive).** The whole phase adds exactly one DB object,
  a read-only `public.agapay_my_profile()`; it performs no writes, is `stable`, and
  its EXECUTE grant is `authenticated`-only (revoked from `anon`/`public`). No
  Tierra table/column/policy/trigger is touched. *Mitigation:* migration review +
  the § 5.3 prime-directive check assert zero DML on `public.*`. Note Tierra's
  `on_auth_user_created` trigger still fires for genuinely new signups (harmless,
  expected — GAPS #26); Phase 2 creates **no** new prod auth users (accounts are
  provisioned in the Phase-6 import).
- **Redirect flicker / loops.** Async profile resolve could redirect before auth
  settles. *Mitigation:* block render on `AuthSplash` until the first resolve, so
  guards never see `loading`; enforce the two-place invariant (layout guards push
  unauth in; login guard pushes signed-in out); `noAccess` is a terminal state on
  `/login`, never re-entering a protected tree.
- **`noAccess` users** (authenticated Tierra members with no Agapay profile) could
  loop between `/login` and a guarded tree. *Mitigation:* explicit `noAccess`
  snapshot → login page shows a "no access yet" note + sign-out; guards treat it
  like `signedOut` (send to `/login`, which does not bounce it back out).
- **Session expiry mid-use.** *Mitigation:* `onAuthStateChange` → `signedOut` →
  `router.invalidate()` → guard redirects to `/login`; no stale protected view.
- **Secret handling.** Only the anon key ships to the client (RLS-enforced,
  public-safe); the service-role key is never referenced in `app/`. `.env` is
  gitignored; only `.env.example` is committed.
- **Cross-schema exposure.** Using the `public` RPC instead of exposing
  `discipleship` to PostgREST keeps the read surface minimal and the client
  contract stable even if Phase 1 changes schema exposure.
- **Demo/live parity.** A single `VITE_DEMO_MODE` flag toggles the whole behavior;
  risk of the demo bar leaking into prod. *Mitigation:* guards no-op only in demo;
  Phase 6 explicitly flips the flag off and the § 5.4 case 8 verifies demo
  behavior separately.
- **Design fidelity.** Login page is new UI not in the handoff (GAPS #15). *Mitigation:*
  compose it strictly from existing tokens/primitives (form field, primary red
  pill, logo mark, scripture footer); invent no colors (RULES #3/#5); flag for a
  proper design pass later.

## 8. Rollback / safety

- **Instant app-level rollback:** set `VITE_DEMO_MODE=true` and redeploy → the app
  reverts to the working prototype (role-switcher bar, no auth, no DB dependency).
  The public demo is never at risk during the build.
- **DB rollback:** the only DB change is additive —
  `drop function if exists public.agapay_my_profile();` fully reverts it; the
  `discipleship` schema and all Tierra objects are untouched, so status quo is
  preserved regardless.
- **Code rollback:** AuthProvider, guards, config, Supabase client, `/login`, and
  the two `beforeLoad`s are additive; reverting the branch + dropping the function
  restores the exact Phase-1 state. Work on a feature branch; per project git
  rules, **the user runs commit/push manually** and no work merges to `main` until
  the § 6 gate is green.
- **What always stays safe:** Tierra's directory, policies, and data; the
  `discipleship` schema; and the deployed public prototype (guarded by the flag).
