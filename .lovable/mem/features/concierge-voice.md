---
name: concierge-voice
description: Concierge widget supports voice input (Web Speech API) and optional spoken replies (speechSynthesis); acts as planning copilot end-to-end
type: feature
---
- Support widget (`src/components/support-widget.tsx`) uses browser-native `webkitSpeechRecognition` for mic input and `window.speechSynthesis` for spoken replies — no backend cost, no API key.
- Voice-out is opt-in via the speaker toggle in the header; preference persists in `sessionStorage.kc_concierge_voice`.
- Widget open state persists in `sessionStorage.kc_concierge_open` so React re-mounts (HMR, route invalidation) don't close it.
- All buttons MUST have `type="button"` — defaulting to submit was a refresh trigger when the widget remounted inside a form-like context.
- Concierge SYS_PROMPT now includes a COPILOT MODE: walk users through event build (plan → /events/new → guests → invite copy → reminders → optional Atelier extras → launch → thank-you cards) and project build (PM trial → project → kanban → invite collaborators → link to event), plus on-demand definitions of industry terms (RSVP, run-of-show, BEO, escort card, etc.).
- **No hard refresh rule** applies to the widget too: opening/closing/sending must never trigger window.location.* or a route reload.
