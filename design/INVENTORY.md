# Design Inventory — Agapay prototype export

Source: `design/design_handoff_agapay/` (Claude Design handoff, exported 2026-07-10).
Files inventoried: `CLAUDE.md`, `README.md`, `RULES.md`,
`design_files/Agapay App.dc.html` (shipped prototype, all 7 screens + working state logic),
`design_files/Agapay Explorations.dc.html` (3 earlier home directions: 1a Listahan,
1b Kamustahin, 1c Pastol — shipped = 1b header + 1c body + 1a meeting rows),
`design_files/quest-laguna-tokens.css` (brand token sheet),
`design_files/assets/logo-mark.png` (105×105 PNG, red disc triple-chevron — never redraw).

---

## 1. Screens

### Discipler (mobile, 390–430px, cream bg `#FBF5E9`, bottom tab bar Home/Disciples/Meetings)

| # | Screen | Key elements |
|---|--------|--------------|
| 1 | **Home (follow-up queue)** | White header card (logo 26px + "Agapay" Poppins 700 15px; date Manrope 600 11px 50% ink; 34px initials avatar). 64px SVG progress ring (r=27, stroke 7, track `#F4ECDC`, fill `#D81E2F`, round caps, −90° start, circumference 169.6) with queue count (Poppins 800 20px). Title "N check-ins to go" (Poppins 700 17px) + subtitle (Manrope 500 12px, 55% ink). 3 stat chips (Manrope 700 10.5px pills, padding 5px 10px). Queue groups: **Quiet for a while** (red dot, per-disciple cards w/ View/Log/Schedule 44px footer), **Cooling down** (amber dot, stacked rows w/ two 40px round icon buttons), **Walking steady** (green, overlapping 38px avatars, −8px margin). Empty-queue celebration card (56px green disc + check, "All caught up!"). **This week** meeting rows (42px date column: DOW red 10px caps / day Poppins 800 18px; 1px vertical divider; mode chip). Scripture footer (italic 12px + red-caps citation). |
| 2 | **My Disciples tab** | Title "My Disciples" (Poppins 700 20px) + count label. Row cards: 42px avatar, name + stage pill, engagement dot + meta, 56px mini checklist progress bar + %. |
| 3 | **Meetings tab** | Title + red "New" pill button (36px). Upcoming/Past pill filter. Upcoming cards = date-column row + 3-action footer (**Done** green / **Cancel** grey / **No-show** amber, 42px). Past cards: status chip (Completed green / Cancelled grey / No-show amber) + italic note preview. |
| 4 | **Disciple profile (pushed overlay, back arrow)** | Header: 60px avatar, name Poppins 700 19px, stage pill + engagement pill, meta line. 12-week attendance sparkline (inset `#FBF5E9` panel, 12 bars: attended 26px `#3E7A4E`, missed 6px `#E9DDC4`). "Promote to {next}" 44px outline pill (hidden for Leader). Section pill tabs Timeline / Checklist / Meetings / Milestones (active = black pill). Timeline: 30px icon discs + 2px connector — activity ● green, meeting M rose, note N cream, check ✓ green, stage ★ gold. Checklist card: header + %, 6px red progress bar, 22px rounded checkboxes (checked = red fill, label struck + 40% ink), interactive. Milestones: 34px discs (achieved green/check, pending cream), date or "Not yet" amber. Bottom: "Log activity" red pill 46px w/ red glow + "Schedule" white outline pill. |
| 5 | **Log activity (bottom sheet)** — 10-second entry | Grabber, "Log activity / with **{name}**". 5 type chips (One-on-one · Life Group · Sunday Service · Prayer Meeting · Note; single-select, default One-on-one, selected = red pill). Date input (defaults today). Optional notes textarea. 48px red "Save activity" w/ red glow. Toast "Logged — thanks for walking with {first}!". |
| 6 | **Schedule meeting (bottom sheet)** | Disciple select (prefilled), Date + Time 2-col, duration chips 30/45/60/90, mode toggle In-person/Online (selected = black; switches Location ↔ Meeting link label/placeholder), Repeats chips None/Weekly/Biweekly, 48px red "Schedule meeting". |
| 7 | **Promote modal (centered)** | "Promote {first}?", current→next stage pills + red arrow, explainer copy, required textarea ("Why is this disciple ready?"), Confirm disabled grey `#B1A8AB` until note non-empty. |
| 8 | **Meeting outcome sheet** | "How did it go?", quick-notes textarea, green 48px "Mark completed". |

### Admin (desktop, 216px black sidebar + cream main pane, max-width 1060px, padding 28–32px)

| # | Screen | Key elements |
|---|--------|--------------|
| 9 | **Dashboard** | Title 24px Poppins + subtitle ("23 disciples · 7 need attention · 3 meetings this week") + cohort select (filters funnel + at-risk). Stage funnel: 3 cards, 4px top border (NB `#D81E2F` / Growing `#E8B11F` / Leader `#3A3437`), count Poppins 800 36px, "avg checklist N%". At-risk list (amber+red across all disciplers, worst first): avatar, name + stage pill, "discipler · cohort", days chip in engagement tint. Discipler load table (Discipler / Load / Last log) w/ red **Inactive** chip when last log > amber threshold. |
| 10 | **Disciples list** | Filter row: search + stage/engagement/discipler/cohort selects (40px, radius 12). Table: checkbox (accent `#D81E2F`) / Name / Stage / Discipler / Engagement (dot+label) / Last activity / Checklist (mini bar + %). Selected rows tint `#FDE4E7`. Bulk action bar (black `#0B0B0C`, radius 14): "N selected — Reassign to [select] [Apply red pill]" → clears selection + toast. |
| 11 | **Checklist management** | Stage pill tabs (active black). Item rows: drag handle ≡, index, text, trash (HTML5 drag-to-reorder, dragged row tints `#FDE4E7`). Footer on `#FBF5E9`: "Add a checklist item…" input + red Add pill. |

Chrome shared: sidebar nav items = 3px red left-accent + 8% white bg when active; admin identity block at bottom. Toast: black pill, bottom-center, ~2.4s. Sheets slide up 220ms `cubic-bezier(.2,.7,.2,1)`; overlays fade 150–180ms; scrim `rgba(11,11,12,.4)`.

## 2. Component inventory (recurring primitives)

- **Avatar disc** — initials (first+last), stage-tinted bg/fg; sizes 34/36/38/40/42/44/60px. Steady group: green tint `#E4EFE0`, 2px `#FBF5E9` border, −8px overlap.
- **Stage pill** — uppercase Manrope 700 8.5–9px, .05em, pill; tints below.
- **Engagement pill / dot** — same shape; dot 7–8px.
- **Stat chip** — Manrope 700 10.5px, pill, 5px 10px.
- **Card** — white, radius 14–16, shadow `0 8px 24px rgba(0,0,0,.06–.08)`, internal 1px `#F4ECDC` rules.
- **Card action footer** — grid of 42–44px cells split by 1px `#F4ECDC` rules.
- **Round icon button** — 40px, `#FBF5E9` bg, 1.5px `#E9DDC4` border, maroon icon.
- **Primary pill button** — red `#D81E2F`, white text, 46–48px, red-glow shadow (primary CTA only); hover `#B81529`, press scale .97.
- **Outline pill button** — white bg, 1.5px border (`#E9DDC4` neutral / `#D81E2F` promote), maroon text, 44–46px.
- **Selector chip** — pill, 1.5px border; selected = red fill/white (type, duration, repeats) or black fill/white (view tabs, mode, stage tabs).
- **Form field** — label 10.5px caps .08em 50% ink; input 44px, radius 12, `#FBF5E9` bg, 1.5px `#E9DDC4` border, Manrope 600 13px; textarea 72–84px; placeholder `rgba(11,11,12,.35)`.
- **Progress bar** — 5–6px track `#F4ECDC`, fill `#D81E2F`, pill.
- **Progress ring** — 64px SVG as above.
- **Section label** — Manrope 700 12.5px caps .12em maroon `#8E0E1E` (group headings add 8px status dot).
- **Date column** — 42px: DOW 10px .08em red / day Poppins 800 18px.
- **Sparkline** — 12 flex bars, 4px gap, 30px tall, radius 3.
- **Timeline item** — 30px icon disc + 2px `#E9DDC4` connector.
- **Checkbox (checklist)** — 22px, radius 7, checked red fill + white 3px check.
- **Toast** — black pill, Manrope 700 13px, pop shadow.
- **Bottom sheet** — white, 20px top radius, 36×4px grabber; **Modal** — 20px radius, pop shadow.
- **Icons** — Lucide outline, stroke 2–2.4, round caps; 11–21px inline.

## 3. Color tokens (as used by the app prototype)

**Brand / ink / cream** (from `quest-laguna-tokens.css`):
red-500 `#D81E2F` (primary) · red-600 `#B81529` (press) · red-700 `#8E0E1E` (maroon text accent) · red-800 `#5C0A14` · red-100 `#FDE4E7`;
ink-1000 `#0B0B0C` · ink-700 `#3A3437` · ink-500 `#6B6266` · ink-300 `#B1A8AB` (disabled) · ink-100 `#E6E1E3`;
cream-50 `#FBF5E9` (app bg) · cream-100 `#F4ECDC` (surface/track) · cream-200 `#E9DDC4` (border) · paper `#FFFFFF`;
gold-500 `#E8B11F` (Growing funnel bar ONLY) · gold-600 `#C28E0A` · gold-100 `#FBEAB3`.

**Ink alphas used inline:** .6/.55 muted · .5/.45 faint · .4/.35 hushed · scrim `rgba(11,11,12,.4)`.

**Semantic status** (fixed per RULES.md #3; several values exist ONLY in the prototype, not in the token sheet — flagged in GAPS.md):
- Healthy/green: `#3E7A4E`, tint `#E4EFE0`
- Cooling/amber: dot `#C28E0A`, text `#9A7208`, tint `#F8ECD2`
- At-risk/red: `#D81E2F`, tint `#FDE4E7`, fg on tint `#8E0E1E`

**Stage pills (fixed):** New Believer `#FDE4E7`/`#8E0E1E` · Growing `#FBEAB3`/`#7A5A06` · Leader `#E6E1E3`/`#3A3437`.

**Meeting status chips:** Upcoming `#FDE4E7`/`#8E0E1E` · Completed `#E4EFE0`/`#3E7A4E` · Cancelled `#E6E1E3`/`#3A3437` · No-show `#F8ECD2`/`#9A7208`.

## 4. Type scale (app prototype usage)

Fonts: **Poppins** 600/700/800 (names, titles, numbers) · **Manrope** 400–800 (everything else). Google Fonts. No other families in the app.

| Role | Spec |
|------|------|
| Page title (admin) | Poppins 700 24px, −.01em |
| Tab page title (mobile) | Poppins 700 20px, −.01em |
| Profile name | Poppins 700 19px |
| Home title / modal title | Poppins 700 17px |
| Sheet title | Poppins 700 16px |
| Card name | Poppins 700 14–15px |
| Row name / card heading | Poppins 700 13px |
| Big numbers | Poppins 800 — ring 20px, date-day 18px, funnel 36px, stat 20px |
| Section label | Manrope 700 12.5px caps .12em maroon |
| Body / blurb | Manrope 500 12–12.5px, lh 1.5–1.55 |
| Meta / sublines | Manrope 500–600 11–11.5px |
| Buttons | Manrope 700 11.5–14px |
| Field label | Manrope 700 10.5px caps .08em |
| Chips | Manrope 700 10–10.5px |
| Pills (stage/status) | Manrope 700 8.5–9.5px caps .05em |
| Tab bar label | Manrope 700 9.5px |
| Scripture citation | Manrope 700 10px caps .12em red |

## 5. Spacing, radii, shadows, motion

- **Spacing scale:** 4/8/12/16/20/24 (+32 desktop). Screen padding 20px mobile, 28–32px desktop. Card padding 12–18px. List gaps 8–10px.
- **Radii:** cards 14–16 · inputs/selects/panels 12 · sheets 20 (top) · modals 20 · sidebar nav item 10 · checklist checkbox 7 · sparkline bar 3 · pills/chips/buttons/avatars 999.
- **Shadows:** card `0 8px 24px rgba(0,0,0,.06–.08)` · pop/modal/toast `0 18px 40px rgba(0,0,0,.35)` · red glow `0 8px 28px rgba(216,30,47,.35)` (primary CTA only).
- **Motion:** ease-out `cubic-bezier(.2,.7,.2,1)`; sheets up 220ms, fades 150–180ms, range 120–360ms; press scale .97; nothing bouncy.
- **Hit targets:** ≥44px primary, ≥40px secondary icon buttons.

## 6. Behavior encoded in the prototype's logic (source: `Agapay App.dc.html` script)

- Engagement fn: red if `days > 28`, amber if `days > 14`, else green — thresholds are **component props** (`amberAfterDays`=14, `redAfterDays`=28), i.e. designed as config.
- Queue = quiet + cooling, sorted `days` desc within groups; ring fraction = (total − queue)/total; ring dash `max(4, frac×169.6) 169.6`.
- Log activity: sets days→0, updates `lastSeen`, prepends timeline event (`note` kind if type=Note else `activity`), toast, closes sheet.
- Complete meeting: status→completed + note, disciple days→0, prepends `meeting` timeline event. Cancel/No-show: status change + toast only (no engagement reset).
- Promote: guard on empty note; prepends `stage` event w/ note, stage→next, `inStage`→"Just promoted", checklist ← fresh snapshot of new stage's master list.
- Bulk reassign: sets `discipler` on selected, clears selection, toast.
- Checklist mgmt: add/delete/drag-reorder mutate master only (instances keep their snapshot).
- Master checklist sample content: NB 6 items (Water baptism, One2One ×4, 4 Sundays in a row, Join a Life Group, first Bible, share testimony) · Growing 5 (Victory Weekend, serve, devotion habit, doctrine classes, lead prayer) · Leader 4 (leadership training, facilitate LG, disciple someone, School of Discipleship).
- Sample dataset: 23 disciples, 4 disciplers (Marco Reyes 8, Ana Lim 6, Joseph Tan 5, Ruth Navarro 4), cohorts Q1 2026 / Q2 2026 / 2025 Batch 2; admin = Ptr. Dennis Ocampo. Discipler last-log: Marco 0d, Ana 2d, Joseph 21d (Inactive), Ruth 5d.
- Dates 12-hour ("7:00 PM"), Asia/Manila.
