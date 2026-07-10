# Gaps & Mismatches — prototype vs. spec (logged 2026-07-10, pre-scaffold)

Legend: **[BLOCKER-ish]** needs a decision to scaffold correctly (proposed resolution
included, confirmed via scaffold-plan approval) · **[GAP]** missing state/feature to
handle at build time · **[NOTE]** superseded or informational.

## Spec-source gaps

1. **[BLOCKER-ish] Root `CLAUDE.md` is empty (0 bytes).** The real project memory is
   `design/design_handoff_agapay/CLAUDE.md`, which says "drop this file at the repo
   root." → Scaffold will copy it to the root and extend it with the stack/engineering
   sections it lacks.
2. **[BLOCKER-ish] No CLAUDE.md defines the Supabase data model.** The session brief
   references "the data model in CLAUDE.md" (exact tables, `discipleship_` migration
   prefix, Tierra tables, build order, the four skills), but no file in the repo
   contains those specifics. The handoff README's TypeScript-ish domain model
   (Disciple/Event/Meeting/MasterChecklist) is UI-state-shaped, not a DB schema.
   → The scaffold plan derives a normalized schema from README + RULES + the brief's
   named tables (`disciple_profiles`, `activity_logs`, `meetings`). Confirmed at plan
   approval.
3. **[BLOCKER-ish] "Tierra" tables are referenced nowhere in the repo.** Unknown
   whether the Supabase project is shared with a Tierra app locally; nothing exists in
   this repo to collide with. → Defensive resolution: all Agapay objects live in a
   dedicated Postgres schema `discipleship` (never `public`), so no shared table can
   be touched by name.
4. **[GAP] The four skills (migration, feature-slice, rls-check, design-compare) are
   named in the brief but not specified in any CLAUDE.md.** → Authored from the
   engineering rules in RULES.md + the brief's verification requirements.

## Data-model mismatches (prototype → real schema)

5. **[NOTE] `daysSinceLastActivity` is a stored field in the prototype's domain model,
   but RULES.md #18 forbids storing derivable engagement state.** Resolution: never
   persist it; derive from `activity_logs` timestamps + completed `meetings` via the
   engagement view. Same for checklist %, queue membership, funnel counts,
   discipler-inactive flag.
6. **[GAP] `attendance: boolean[12]` (12-week Sunday sparkline) has no capture UI
   anywhere in the prototype.** No screen records Sunday attendance except logging a
   "Sunday Service" activity. Resolution: derive the sparkline from `activity_logs`
   rows of type `sunday_service` bucketed into the last 12 Sundays (Asia/Manila).
   Consequence: a Sunday counts only if the discipler logs it — copy may need to
   encourage this. Flagged for the design lead.
7. **[GAP] Milestones have display UI but no create/edit/achieve UI.** Rows render
   "achieved (date)" vs "Not yet", but nothing sets a milestone. Also unclear whether
   the milestone list (Salvation decision, First Life Group, Water baptism, First
   serve) is fixed, per-stage, or admin-editable. Scaffold creates the table with a
   default set seeded per disciple; marking-achieved UI is an open question for the
   feature phase.
8. **[GAP] Meeting recurrence saves only a single meeting in the prototype** — the
   Weekly/Biweekly choice changes the toast text and nothing else. Real semantics
   (materialize N future rows? recurrence rule + generator?) are undefined. Scaffold
   stores `recurrence` on the row; instance generation deferred to the meetings slice.
9. **[GAP] No-show streaks are not surfaced anywhere in the prototype**, though the
   brief asks the seed to include one. No badge/blurb exists for "2 no-shows in a
   row". Seed will contain the data; surfacing is a feature-phase question.
10. **[GAP] Timeline "Joined Agapay" / "Started as New Believer" events imply an
    intake event**, but there is no UI to create a disciple (see #14). Resolution:
    creating a disciple writes an initial `stage_transitions` row (from NULL → stage).
11. **[NOTE] Timeline is append-only (RULES #21)** — corrections are new `note`
    events. The timeline will be a read model (union of activity_logs, meetings,
    checklist completions, stage transitions), so append-only falls out naturally;
    no UPDATE/DELETE policies will be granted on activity_logs to disciplers.

## Business-rule inconsistencies inside the prototype

12. **[GAP] "At-risk" means two different things.** Discipler home chip counts
    red-only (`quiet.length` → "1 at-risk"); admin dashboard "At-risk disciples" list
    filters `days > amber` (amber + red, matching "7 need attention"). The word
    "at-risk" for both is misleading. Scaffold treats **at-risk = red (>28d)** per the
    domain vocabulary, and the admin list = "needs attention" (amber+red). Copy
    decision flagged for the design lead.
13. **[NOTE] Explorations file says amber 15–30 / red 30+;** final spec and shipped
    prototype use 15–28 / >28. Explorations values are superseded. (Likewise its 4-tab
    bar with a Profile tab — shipped design has 3 tabs.)
14. **[GAP] No UI exists to create/archive disciples, disciplers, or cohorts** — in
    the prototype all data pre-exists. v1 presumably needs at least admin "add
    disciple". Not in scope for scaffold (seed provides data); logged as the biggest
    missing screen.
15. **[GAP] No auth/login screen exists** — the prototype uses a role-switcher bar.
    Scaffold ships a minimal token-styled email+password login (Supabase auth) with
    the role-based redirect; design lead may want a proper design later.
16. **[GAP] Missing empty states:** disciples tab with 0 disciples, meetings tabs
    with no upcoming/past rows, admin table with 0 filter matches, at-risk list when
    empty (celebration?), checklist stage with 0 items. Only the queue-empty
    celebration is designed.
17. **[GAP] No loading/error/offline states designed** for any screen (relevant since
    this ships as a PWA). Skeletons will follow card geometry; flagged for design.
18. **[GAP] Cancel/No-show are one-tap with no undo** beyond a toast; mis-taps are
    destructive-ish. Consider undo-in-toast at feature time.
19. **[NOTE] Prototype hardcodes "Discipler: Marco Reyes" on every profile** and
    derives discipler-load "last log" from a hardcoded map — both become real derived
    data.
20. **[GAP] Checklist toggle permissions are unspecified** — profile checkboxes are
    interactive for the discipler; can an admin toggle from the desktop table view?
    (No admin per-disciple screen exists.) Scaffold RLS: discipler-of-record + admin
    may toggle.
21. **[GAP] Promote flow: no guard for "Leader" beyond hiding the button**, and no
    demote/undo path (consistent with append-only audit; corrections would be a new
    transition). RPC will reject promoting a Leader server-side.

## Tierra directory integration (discovered 2026-07-10, `~/projects/quest/tierra`)

23. **[NOTE] "Tierra" = the church directory app**, sharing Supabase project
    `ncijotdkovijkcpqnlbv` (per `tierra/.mcp.json`). Its schema lives in `public`
    (`tierra-app/supabase/*.sql`): members, satellites, user_profiles, cell_groups,
    ministries, junction tables, event_registrations.
24. **[NOTE] `public.members` already models discipleship:** `discipler_id`
    (member→member), `discipleship_stage` CHECK ('Newbie','Growing','Leader'),
    `leadership_level` ('Member','Disciple Maker','Eagle','Pastor','Head Pastor'),
    `follow_through`, `discipleship_journey`, plus identity fields Agapay needs
    (name, photo_url, satellite_id, joined_date, is_archived).
25. **[NOTE] Directory is readable without touching Tierra:** `members_read_public`
    (SELECT USING NOT is_archived) survives both RLS fix files — authenticated (even
    anon) reads are already allowed. Agapay needs no new policy on Tierra tables.
26. **[NOTE] Shared auth is viable:** Tierra `user_profiles` maps `auth.users` →
    `members.member_id`; roles are super_admin/satellite_leader/cell_leader/member
    (no 'discipler'). Agapay keeps its own role table in the `discipleship` schema
    keyed to the same `auth.users`; Tierra's `on_auth_user_created` trigger will also
    create a Tierra `user_profiles` row for any new auth user — harmless, expected.
27. **[GAP] Stage label mismatch:** Tierra stores **'Newbie'**; Agapay design mandates
    **'New Believer'** everywhere in UI. Resolution: map at the boundary
    (Newbie ↔ New Believer); never display "Newbie".
28. **[GAP] No cohort in Tierra.** Agapay cohort ("Q2 2026") stays Agapay-side
    (or derives from `members.joined_date` quarter as a default at import).
29. **[RESOLVED 2026-07-10] Source of truth for stage + discipler assignment =
    the directory (`public.members`).** Agapay reads `discipleship_stage` +
    `discipler_id` from members and writes them back ONLY via locked-down
    `security definer` RPCs in the `discipleship` schema (promote, reassign,
    add-disciple — the last may insert a minimal members row so new believers
    appear in the directory immediately). No Tierra schema/policy changes.
    Discipler role at import = any member referenced by another member's
    `discipler_id`; admins can grant the role explicitly afterward.
30. **[NOTE] Local dev baseline:** Tierra's SQL files are ad-hoc (SQL-Editor) scripts,
    not CLI migrations. Local `supabase db reset` needs a baseline migration
    reconstructing the Tierra schema from those files (or `supabase db pull` once
    linked); when pushing to the shared remote, the baseline must be marked as
    already-applied (`supabase migration repair`) so it never executes remotely.
31. **[NOTE] Supabase MCP** is configured in the Tierra repo only. Copy its
    `.mcp.json` into Agapay so future sessions can introspect/query the shared
    project directly.

32. **[NOTE 2026-07-10] Third stage-label variant found in production Tierra UI:**
    the live deployment displays **'New Friends' / 'Schooling' / 'Leader'** (repo
    schema check says 'Newbie'/'Growing'/'Leader'; Agapay design mandates
    'New Believer'/'Growing'/'Leader'). Confirm the DB check constraint on the live
    project before wiring Supabase — the boundary mapping must cover whichever
    values are actually stored.

## Token-sheet mismatches (tokens.css vs. app spec)

22. **[NOTE] `quest-laguna-tokens.css` is the church-wide poster system, not the app
    theme.** Divergences the app theme must resolve (app values win, per README/RULES):
    - Status green/amber colors (`#3E7A4E`, `#E4EFE0`, `#F8ECD2`, `#9A7208`,
      `#7A5A06`) exist **only** in prototype inline styles, not in the token sheet.
    - `--shadow-card` in tokens is `rgba(0,0,0,.18)`; the app uses `.06–.08`.
    - Token radii are 4/8/14/20/28; the app uses 12 (inputs) and 16 (cards) too.
    - Token `--bg-default` is near-black (poster mode); the app default is cream.
    - Poster fonts (Anton, Oswald, Caveat Brush, Sacramento) and grunge/gradient
      utilities are **excluded** from the app theme (RULES #5: Poppins + Manrope only).
    - Token type scale (`--fs-hero`…) is poster-scale; the app uses the 8.5–36px
      UI scale inventoried in INVENTORY.md.
    → The Tailwind theme ports brand colors/spacing/motion from the token sheet and
    adds the app-only semantic tokens from the prototype, under `ql-*`/semantic names.
