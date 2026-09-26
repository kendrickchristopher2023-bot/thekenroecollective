# Correct the Schedules text content

## What will change
- Give **Send now** its own complete text template instead of copying whichever automatic reminder happens to be closest in time.
- Put the schedule title first, then the recipient greeting, date and time, saved description (including meeting ID/passcode), join link, and personal RSVP link.
- Label the links clearly: **Join meeting**, **RSVP**, and optionally **Add to calendar** only when space permits.
- Keep the first-text Kenroe attribution, STOP instructions, host contact line, consent checks, quiet hours, caps, opt-outs, and duplicate-send protection unchanged.
- Normalize legacy web addresses such as `www.zoom.com` to an `https://` link when rendering, without changing the saved reunion schedule.

## Verification
- Add tests proving the complete Send now default includes `{description}` and `{rsvp}` and keeps event-first ordering.
- Verify personalized previews and final queued text match.
- Run focused tests, type checks, and phone/desktop visual checks.
- Do not publish or send another real text during this change.
