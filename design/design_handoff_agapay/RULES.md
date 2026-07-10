# RULES.md — Binding design & engineering rules for Agapay

These rules are non-negotiable unless the design lead says otherwise.
Claude Code: check work against this list before committing UI changes.

## Visual identity (Quest Laguna "cream mode")
1. Backgrounds: app bg `#FBF5E9`, surfaces `#F4ECDC`, cards `#FFFFFF`,
   borders `#E9DDC4`. Admin sidebar is solid black `#0B0B0C` with a 3px red
   left-accent on the active nav item. No other dark surfaces.
2. One accent color: brand red `#D81E2F` (hover/press `#B81529`, text accent
   maroon `#8E0E1E`). Gold `#E8B11F` appears ONLY on the "Growing" funnel bar.
   Never introduce blues, purples, or generic SaaS grays.
3. Status colors are fixed: green `#3E7A4E`/`#E4EFE0`, amber `#C28E0A`
   (text `#9A7208`)/`#F8ECD2`, red `#D81E2F`/`#FDE4E7`.
4. Stage pill tints are fixed: New Believer rose (`#FDE4E7`/`#8E0E1E`),
   Growing gold (`#FBEAB3`/`#7A5A06`), Leader ink (`#E6E1E3`/`#3A3437`).
5. Typography: Poppins (600–800) for names, titles, and big numbers; Manrope
   for everything else. No other font families. Section labels are uppercase
   Manrope 700 with .12em tracking in maroon.
6. Shape: cards 14–16px radius, inputs 12px, bottom sheets 20px top radius,
   buttons/chips/pills always 999px. No sharp-cornered boxes.
7. Shadows: card `0 8px 24px rgba(0,0,0,.06)`; modal `0 18px 40px
   rgba(0,0,0,.35)`; red glow `0 8px 28px rgba(216,30,47,.35)` reserved for
   the primary CTA only.
8. Icons: Lucide outline only, stroke 2–2.4, round caps. The triple-chevron
   brand mark is the PNG asset (`assets/logo-mark.png`) — never redraw it in
   text, SVG, or CSS.
9. No emoji in UI copy. Scripture = italic footer + red-caps citation, never
   a headline.

## UX rules
10. Mobile-first for all discipler screens (design width 390–430px). Hit
    targets ≥ 44px for primary actions, ≥ 40px for secondary icon buttons.
11. The follow-up queue is the home screen's hero. Nothing may push the
    "Quiet for a while" group below the fold except the header. Queue sorts
    longest-quiet first.
12. Warm, no-guilt copy. Never shame the discipler or the disciple ("overdue",
    "failing", "delinquent" are banned words). The empty queue is a
    celebration, not a blank list.
13. Log activity ≤ 10 seconds: prefilled disciple, chip type selector,
    today-by-default date, optional notes, one save. No extra required fields.
14. Promotion always goes through the approval modal with a required note.
    Confirm stays disabled until the note is non-empty.
15. Every disciple-affecting action gives feedback (toast) and updates the
    queue/ring immediately (optimistic UI is fine).
16. Motion: 120–360ms, ease-out (`cubic-bezier(.2,.7,.2,1)`); sheets slide up,
    overlays fade. Nothing bouncy.

## Engineering rules
17. Engagement thresholds (14/28 days) live in one config module; all
    derivations (queue groups, chips, funnel, at-risk, inactive-discipler
    flag) read from it.
18. Engagement, queue membership, checklist %, and funnel counts are always
    DERIVED from raw data (last-activity timestamps, checklist items) — never
    stored as separate mutable fields that can drift.
19. Role scoping is enforced server-side: a discipler's queries return only
    their assigned disciples. The admin role is read/write across all.
20. Master checklist edits (add/remove/reorder) must not mutate checklist
    instances already in progress; instances snapshot the master at stage
    entry (promotion).
21. Timeline is append-only. Corrections are new `note` events, not edits.
22. Dates/times: Asia/Manila timezone; 12-hour display ("7:00 PM").
23. Port the tokens in `design_files/quest-laguna-tokens.css` into the app's
    theming system (CSS vars or theme object). Components reference tokens,
    never raw hex literals.
