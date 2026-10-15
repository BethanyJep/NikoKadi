# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Friends and family playing Kadi together remotely, mostly on phones, in short sessions. They already know Kadi, or learn it from the people they play with. A game is started by sharing a room code over a chat app.

## Product Purpose
Niko Kadi is an online multiplayer version of the Kenyan card game Kadi. Players enter a display name (anonymous sign-in), create or join a room with a 6-character code, and play in real time. Success is getting friends into a room fast and keeping the state of play (turn, penalty, required suit, Niko Kadi declarations) unambiguous.

## Positioning
A browser-based Kadi that follows the rules as played with friends in Kenya, including the Niko Kadi declaration and winning-card rules, with no install and no sign-up.

## Operating Context
2–4 players per room. Hosted on GitHub Pages with Supabase (anonymous auth, Postgres, Realtime). Vanilla JS and CSS, no build step.

## Capabilities and Constraints
- Rooms hold up to 4 players; the host starts the game; scores carry across rounds.
- Rules are implemented in `game.js` and are the source of truth.
- UI copy is mostly English; game terms stay in Swahili (Kadi, Niko Kadi).
- No build step; static files only.

## Brand Commitments
Name: Niko Kadi. Visual direction (confirmed by the user): a card table. Real playing-card faces (corner indices and pips) on a dark cloth, hands fanned as if held, an African-inspired palette limited to four bright colours chosen from the colour wheel (clay 14°, saffron 43°, teal 190°, indigo 228°) with neutrals for everything else. No national-flag colours. Ship both a light and a dark theme that follow the device setting (`prefers-color-scheme`).

## Evidence on Hand
No testimonials, usage data or external brand assets exist. README screenshots are in `docs/screenshots/`.

## Product Principles
- Game state is always legible at a glance, above everything decorative.
- Getting friends into a room should take seconds on a phone.
- Rules are shown where they are needed, not in a separate manual.
- Stay faithful to how Kadi is actually played.

## Accessibility & Inclusion
Phones first: comfortable touch targets, no horizontal scroll, readable in bright daylight. Meet WCAG AA contrast, visible keyboard focus, and respect reduced motion.
