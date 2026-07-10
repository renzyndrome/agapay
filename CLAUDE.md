# CLAUDE.md — Agapay (Quest Laguna discipleship monitoring app)

> Drop this file at the repo root. It is Claude Code's project memory.
> Companion files: `RULES.md` (binding design/engineering rules) and
> `design_handoff_agapay/README.md` (full design spec). Read both before UI work.

## What this product is
Agapay helps Quest Laguna church disciplers (mentors) walk with their disciples
through 3 stages: **New Believer → Growing → Leader**. Core promise: **no
disciple gets stagnant or forgotten**. The heart of the product is the
**follow-up queue** on the Discipler home screen — a triage inbox the discipler
clears to zero, with a celebratory empty state.

## Users & roles
- **Discipler** — mobile-first (phone). Sees ONLY their assigned disciples.
  Logs activities, schedules meetings, tracks stage checklists.
- **Admin** — desktop. Sees everything: stage funnel, at-risk list across all
  disciplers, discipler load, disciples table w/ bulk reassign, master
  checklist editor.
- Disciples do NOT log in (v1). No disciple-facing surface.

## Domain vocabulary (use these exact terms in code and UI)
- **Stage**: `New Believer | Growing | Leader` (pill badges, muted tints)
- **Engagement**: derived from days since last activity —
  `Healthy` (green, ≤14d), `Cooling` (amber, 15–28d), `At-risk` (red, >28d).
  Thresholds are config constants, not hardcoded literals.
- **Activity types**: One-on-one, Life Group, Sunday Service, Prayer Meeting, Note
- **Meeting statuses**: upcoming, completed, cancelled, noshow
- **Cohort**: intake batch (e.g. "Q2 2026")
- **Master checklist**: per-stage ordered item list, admin-editable; each
  disciple holds an instance snapshot for their current stage.

## Key behaviors (do not regress)
1. Logging an activity or completing a meeting resets the disciple's
   engagement clock to 0 and prepends a timeline event.
2. Promoting a disciple **requires a note** (audit trail, visible to
   leadership); promotion resets their checklist to the new stage's master
   list and adds a `stage` timeline event.
3. The home queue sorts longest-quiet first and groups: Quiet for a while
   (red) / Cooling down (amber) / Walking steady (green avatars only).
4. Log activity flow must stay a **10-second mobile entry**: type chips +
   date + optional note, one save button. Never add required fields to it.
5. A discipler whose own last logged activity exceeds the amber threshold is
   flagged **Inactive** in the admin discipler-load table.
6. Bulk reassign moves selected disciples between disciplers and clears the
   selection.

## Design source of truth
- `design_handoff_agapay/design_files/Agapay App.dc.html` — hi-fi interactive
  reference. Recreate it in this codebase's stack; do not ship the HTML.
- `design_handoff_agapay/design_files/quest-laguna-tokens.css` — brand tokens.
  Import/port these as the theme; never invent new colors.
- Visual identity: Quest Laguna "cream mode" — warm, pastoral, NOT corporate
  SaaS. See `RULES.md` for the binding rules.

## Copy tone
Warm, direct, no guilt. "A quick check-in goes a long way", "No one left
behind", "Thanks for walking with Jomar!". English labels; light Tagalog
garnish allowed in greetings/encouragements only. Scripture appears as a small
italic footer with red-caps citation — never as a headline. No emoji in
official copy.

## Memory / decisions log
- 2026-07-10 — Home screen = mix of explored options: progress-ring header
  (1b) + urgency-grouped queue body (1c) + date-column meeting rows (1a).
- 2026-07-10 — Engagement thresholds default 14/28 days; must stay configurable.
- 2026-07-10 — v1 scope: no disciple login, no messaging/notifications, no
  photo uploads (initials avatars on stage-tinted discs).
- "Agapay" is a working title.
