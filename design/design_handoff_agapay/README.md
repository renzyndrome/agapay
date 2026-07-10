# Handoff: Agapay — Discipleship Monitoring Tool

## Overview
**Agapay** (working title) is a discipleship monitoring web app for Quest Laguna church (Laguna, Philippines). Disciplers (mentors) track the spiritual growth of their disciples through 3 stages: **New Believer → Growing → Leader**. The product's core promise: *no disciple gets stagnant or forgotten*. The heart of the product is the **follow-up queue** on the Discipler home screen.

Roles:
- **Discipler** — sees only their assigned disciples; logs activities, schedules meetings, tracks checklists. **Mobile-first** (phones).
- **Admin** — church leadership; sees everything, manages assignments and checklists. **Desktop**.
- Disciples do NOT log in (v1).

## About the Design Files
The files in `design_files/` are **design references created in HTML** — interactive prototypes showing intended look and behavior, **not production code to copy directly**. Your task is to **recreate these designs in the target codebase's existing environment** (React, Vue, native, etc.) using its established patterns and libraries. If no environment exists yet, pick an appropriate stack (a React + TypeScript SPA with a lightweight backend is a natural fit) and implement the designs there.

Open `design_files/Agapay App.dc.html` in a browser to explore the working prototype (role switcher at top; everything is clickable). `Agapay Explorations.dc.html` shows the three earlier home-screen directions; the shipped design is a mix (1b header + 1c body + 1a meeting rows).

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, copy, and interactions are final intent. Recreate the UI pixel-faithfully using the design tokens below. Sample data (names, dates) is placeholder.

## Design language (summary)
- Calm, warm, pastoral — **not corporate SaaS**. Quest Laguna's "cream mode": warm off-white surfaces, white rounded cards, generous whitespace, one warm accent (brand red).
- Fonts: **Poppins** (600/700/800) for names/titles/numbers, **Manrope** (400–800) for body/labels/UI. (Google Fonts.)
- Cards: white `#FFFFFF`, radius 14–16px, shadow `0 8px 24px rgba(0,0,0,.06–.08)`. Buttons/pills: full pill radius (999px).
- Section labels: 12.5px Manrope 700, uppercase, letter-spacing .12em, maroon `#8E0E1E`.
- Icons: Lucide (outline, stroke 2–2.4, round caps), 13–21px inline.
- Scripture line: small italic body with citation in red caps (e.g. `— HEBREWS 10:24`) as a footer motif, never a headline.
- Brand mark: `assets/logo-mark.png` (red disc triple-chevron). **Never redraw it.**

## Domain model
```
Disciple { id, name, stage: 'New Believer'|'Growing'|'Leader', discipler,
           cohort, daysSinceLastActivity, lastSeen, inStage,
           attendance: boolean[12],           // last 12 Sundays
           checklist: {text, done}[],         // instance of stage's master checklist
           milestones: {title, date|null}[],  // baptism, first serve, …
           timeline: Event[] }
Event    { kind: 'activity'|'meeting'|'note'|'check'|'stage', title, date, note? }
Meeting  { id, discipleId, datetime, durationMin, mode: 'inperson'|'online',
           locationOrLink, recurrence: 'none'|'weekly'|'biweekly',
           status: 'upcoming'|'completed'|'cancelled'|'noshow', note? }
MasterChecklist { stage → string[] }   // admin-editable, ordered
```

**Engagement rules** (configurable constants, defaults):
- `green / Healthy` — last activity ≤ 14 days
- `amber / Cooling` — 15–28 days
- `red / At-risk` — > 28 days

Logging any activity or completing a meeting resets `daysSinceLastActivity` to 0 and prepends a timeline event.

## Screens / Views

### 1. Discipler home (mobile, ≤430px) — most important screen
Vertical scroll, cream `#FBF5E9` background, bottom tab bar (Home / Disciples / Meetings).

**Header (white card, full-bleed, 1px bottom border `#E9DDC4`):**
- Row: logo-mark 26px + "Agapay" (Poppins 700 15px) — right: date (Manrope 600 11px, 50% ink) + 34px avatar disc (initials, cream bg, maroon text).
- **Progress ring** 64px (SVG, r=27, stroke 7; track `#F4ECDC`, fill `#D81E2F`, round caps, −90° start) with queue count centered (Poppins 800 20px). Beside it: title "3 check-ins to go" (Poppins 700 17px) and subtitle "You've checked in with 5 of 8 disciples recently. Keep going!" (Manrope 500 12px, 55% ink). When queue = 0: "All caught up!".
- **Stat chips** (pill, Manrope 700 10.5px, padding 5px 10px): "8 disciples" (cream `#F4ECDC`/ink), "1 at-risk" (rose `#FDE4E7`/maroon), "3 meetings this week" (cream).

**Follow-up queue — grouped by urgency, sorted longest-quiet first:**
- Group heading = 8px status dot + uppercase label: **"QUIET FOR A WHILE"** (red, > 28d), **"COOLING DOWN"** (amber, 15–28d), **"WALKING STEADY"** (green, ≤ 14d).
- *Quiet* cards (one card per disciple): 44px avatar disc (stage-tinted), name (Poppins 700 15px) + stage pill, warm no-guilt blurb ("No activity in 32 days. Last seen: Life Group, Jun 8. A quick check-in goes a long way."), then a 3-button footer split by 1px `#F4ECDC` rules: **View / Log / Schedule** (44px tall, maroon text + 13px icons).
- *Cooling* rows (stacked in one card, divided by 1px rules): 40px avatar, name + meta ("Growing · 16 days since last activity"), two 40px round icon buttons (log +, schedule calendar; cream bg, 1.5px `#E9DDC4` border, maroon icon).
- *Steady*: overlapping 38px avatar discs (green tint `#E4EFE0`, −8px margin), count label right-aligned. Tap avatar → profile.
- **Empty queue celebration** (replaces queue groups): centered card, 56px green disc + check, "All caught up!" + "Every disciple has been walked with recently. No one left behind."

**This week (upcoming meetings, next 7 days):** heading + "See all" link (red). Rows: 42px date column (DOW red 10px caps / day Poppins 800 18px), 1px vertical divider, disciple name + "7:00 PM · Kape Kada, Calamba", mode chip ("In-person"/"Online", cream pill).

**Scripture footer:** italic verse + `— HEBREWS 10:24` in red caps, centered.

**Tab bar:** white, top border, 3 tabs (Home/Disciples/Meetings), 21px Lucide icons + 9.5px labels; active = `#D81E2F`, inactive = 45% ink.

### 2. Disciple profile (mobile, pushed over home with back arrow)
- **Header (white):** 60px avatar, name (Poppins 700 19px), stage pill + engagement pill, meta "Discipler: Marco Reyes · 2 months in stage".
- **12-week attendance sparkline:** inset cream panel; 12 flex bars (attended: 26px tall `#3E7A4E`; missed: 6px `#E9DDC4`), label "4 of 12 Sundays".
- **"Promote to Growing" button** (hidden for Leaders): full-width 44px pill, 1.5px red outline, maroon text, up-arrow icon. Opens **approval modal**: current→next stage pills with arrow, explainer ("A short note is required — it becomes part of Jomar's story and is visible to church leadership."), required textarea (Confirm disabled/grey `#B1A8AB` until non-empty), Cancel/Confirm. On confirm: stage changes, checklist resets to new stage's master list, timeline gets a `stage` event with the note.
- **Section pill tabs:** Timeline / Checklist / Meetings / Milestones (active = black pill, white text).
  - *Timeline:* vertical feed, 30px icon disc + 2px connector line; per kind — activity (green), meeting (rose), note (cream), checklist ✓ (green), stage ★ (gold). Title + date + optional note.
  - *Checklist:* card with header "New Believer checklist" + "33%", 6px red progress bar, then rows: 22px rounded checkbox (checked = red fill + white check), label struck-through + 40% ink when done. Checkboxes are interactive.
  - *Meetings:* upcoming + history rows with status chips (Upcoming rose / Completed green / Cancelled grey / No-show amber) and note previews.
  - *Milestones:* rows with 34px disc (achieved: green + check; pending: cream + grey check), title, date or "Not yet" in amber.
- **Bottom actions:** "Log activity" (46px red pill, red glow shadow `0 8px 28px rgba(216,30,47,.35)`) + "Schedule" (white outline pill).

### 3. Schedule meeting (bottom sheet)
Grabber bar, title. Fields (labels: 10.5px caps 50% ink; inputs: 44px, radius 12px, cream bg, 1.5px `#E9DDC4` border):
- Disciple `<select>` (pre-filled when opened from a profile/queue row)
- Date + Time (2-col grid)
- Duration chips: 30 / 45 / 60 / 90 min (selected = red pill)
- Mode toggle: In-person / Online (two 44px buttons; selected = black); switches next field's label/placeholder between **Location** ("e.g. Kape Kada, Calamba") and **Meeting link** ("Paste Google Meet / Zoom link")
- Repeats chips: None / Weekly / Biweekly
- Save: 48px red pill "Schedule meeting" → toast, meeting appears in lists.

**After a meeting** (Meetings tab, each upcoming card has a 3-action footer):
- **Done** (green) → "How did it go?" sheet with quick-notes textarea → marks completed, resets disciple engagement.
- **Cancel** (grey) / **No-show** (amber) → immediate status change + toast ("Marked as no-show — maybe try a different day?").

### 4. Admin dashboard (desktop)
Layout: 216px **black sidebar** (logo lockup, nav items with 3px red left-accent + 8% white bg when active: Dashboard / Disciples / Checklists; admin identity at bottom) + cream main pane (max-width ~1060px).
- Title + subtitle ("23 disciples · 7 need attention · 3 meetings this week") + **cohort select** (All cohorts / Q1 2026 / Q2 2026 / 2025 Batch 2) — filters funnel + at-risk list.
- **Stage funnel:** 3 cards, 4px top border in stage color (NB red `#D81E2F`, Growing gold `#E8B11F`, Leader ink `#3A3437`), stage pill, count (Poppins 800 36px), "avg checklist 41%".
- **At-risk disciples** (red/amber across ALL disciplers, sorted worst-first): avatar, name + stage pill, "Joseph Tan · Q1 2026", days chip in engagement tint.
- **Discipler load table:** Discipler / Load / Last log. Disciplers whose own last logged activity > 14 days get a red **"Inactive"** chip and red last-log text (sample: Joseph Tan, 21 days).

### 5. Disciples list (admin)
- Filter row: search input + selects (stage, engagement, discipler, cohort).
- Table columns: checkbox / Name / Stage / Discipler / Engagement (dot + label) / Last activity / Checklist (mini progress bar + %). Selected rows tint rose `#FDE4E7`.
- **Bulk reassign:** selecting ≥1 row reveals a black action bar: "2 selected — Reassign to [discipler select] [Apply]" → updates rows + toast.

### 6. Checklist management (admin)
- Stage pill tabs (New Believer / Growing / Leader).
- Item rows: drag handle (≡), index number, text, trash icon; **HTML5 drag-to-reorder** (row being dragged tints rose). Footer: "Add a checklist item…" input + red Add pill.

### 7. Log activity quick form (bottom sheet) — 10-second entry
- Title "Log activity" + "with **Jomar Dela Cruz**".
- Type chips: One-on-one / Life Group / Sunday Service / Prayer Meeting / Note (single-select, selected = red pill). Default One-on-one.
- Date (defaults today), Notes textarea (optional, "How was the conversation?").
- 48px red "Save activity" → toast "Logged — thanks for walking with Jomar!", engagement resets to Healthy, queue updates, timeline event prepended.

## Interactions & Behavior
- Navigation: mobile tab bar; profile is a pushed overlay with back arrow; sheets/modals overlay with 40% black scrim (tap scrim to dismiss).
- Sheets slide up 220ms `cubic-bezier(.2,.7,.2,1)`; overlays fade 150–180ms. Transitions are short/confident, never bouncy.
- Toasts: black pill, bottom-center, ~2.4s, warm copy (see samples above).
- Queue is a triage inbox: every log/completed meeting shrinks it; ring fills toward the celebratory empty state.
- Buttons min 44px hit target on mobile. Hover on cream: deepen red one step (`#D81E2F → #B81529`); press: scale .97.
- Copy tone: warm, direct, no guilt. English labels; light Tagalog garnish is acceptable in greetings/encouragements only.

## State Management
- `role` (view switch in prototype; real app = auth), mobile: `tab`, `profileId`, `profileTab`, active sheet + its form fields; admin: `page`, `cohortFilter`, table filters, `selectedIds`, `reassignTo`, checklist `stageTab` + drag index.
- Derived: engagement from `daysSinceLastActivity`; queue groups; ring fraction; funnel counts; at-risk list; discipler load (needs per-discipler `lastLoggedAt`).
- Server data: disciples, meetings, master checklists, disciplers. Mutations: log activity, schedule/complete/cancel/no-show meeting, toggle checklist item, promote (requires note), bulk reassign, checklist CRUD + reorder.

## Design Tokens
Full token sheet in `design_files/quest-laguna-tokens.css`. Key values:

**Colors**
- Brand red `#D81E2F` (primary actions, active states) · press `#B81529` · maroon `#8E0E1E` (text accents) · deep maroon `#5C0A14`
- Ink `#0B0B0C` (headings) · muted ink `rgba(11,11,12,.55)` · faint `rgba(11,11,12,.45)`
- Cream bg `#FBF5E9` · cream surface `#F4ECDC` · cream border `#E9DDC4` · card `#FFFFFF`
- Status: green `#3E7A4E` / tint `#E4EFE0`; amber `#C28E0A` (text `#9A7208`) / tint `#F8ECD2`; red `#D81E2F` / tint `#FDE4E7`
- Stage pills: New Believer `#FDE4E7`/`#8E0E1E` · Growing `#FBEAB3`/`#7A5A06` · Leader `#E6E1E3`/`#3A3437`
- Gold accent `#E8B11F` (funnel "Growing" bar only — use sparingly)

**Type** — Poppins: names/titles/numbers (13–24px, 700–800); Manrope: everything else (9.5–13.5px UI, 400–800). Section labels: 12.5px/700/caps/.12em.

**Space & shape** — spacing 4/8/12/16/20/24; screen padding 20px mobile, 28–32px desktop; radius: cards 14–16px, inputs 12px, sheets 20px top, pills 999px.

**Shadows** — card `0 8px 24px rgba(0,0,0,.06)` · pop `0 18px 40px rgba(0,0,0,.35)` · red glow `0 8px 28px rgba(216,30,47,.35)` (primary CTA only).

## Assets
- `design_files/assets/logo-mark.png` — Quest Laguna round triple-chevron disc. Use the asset; never redraw.
- Icons: [Lucide](https://lucide.dev) outline set.
- Avatars: initials on stage-tinted discs (no photos in v1; photo placeholder acceptable).

## Files
- `design_files/Agapay App.dc.html` — full interactive prototype (all 7 screens; open in browser)
- `design_files/Agapay Explorations.dc.html` — earlier home-screen explorations (1a/1b/1c)
- `design_files/quest-laguna-tokens.css` — brand token sheet (CSS custom properties)
- `design_files/assets/logo-mark.png` — brand mark
- `CLAUDE.md` — drop at the target repo root as Claude Code project memory
- `RULES.md` — binding design/engineering rules referenced by CLAUDE.md
