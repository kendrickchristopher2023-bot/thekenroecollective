---
name: Accessibility & elderly-user UX priorities
description: Priority list of pending UX/a11y improvements for novice and elderly users; ship in order when the user greenlights
type: preference
---
Current state (done):
- Accessibility menu in top nav: 4-step text-size scale (persisted) + high-contrast mode CSS.
- Google Maps address autocomplete removed; plain accessible input in its place.
- Address input already bumped to py-3 text-base with autoComplete="street-address".

Next priorities in order of impact for elderly/novice users:
1. Mobile bottom-nav: text labels under icons, 44x44 min tap targets on every icon-only button (share-hub, floating back/undo, checklist dismiss, chatbot drag handle).
2. Plain-language confirm dialog helper (`confirmDialog(title, body, confirmLabel)`) — wire every destructive action (delete event, archive, remove guest) to it with an undo toast.
3. Bigger inputs everywhere: sweep `py-2 text-sm` inputs in events.new, guest-import, profile → `py-3 text-base` with inline green ✓ / red ⚠ validation.
4. First-run welcome: full-screen 3-step ("Create an event → Add guests → Send it") replacing the tiny checklist for very first session.
5. Consolidate mobile floating widgets (chatbot + checklist + whats-new + back/undo) into one "Help" pill on mobile.
6. Skeleton loaders on /events, /studio, /projects, /vendors, media library, RFQ inbox.
7. Global error boundary with plain-language "Try again / Get help" buttons.
8. Empty states: every list gets a single primary CTA + one-sentence "What is this?" line.

Constraints:
- Follow no-refresh-rules.md — Link/router.navigate only.
- Test every mobile change at 440x665 viewport with a screenshot before claiming done.
