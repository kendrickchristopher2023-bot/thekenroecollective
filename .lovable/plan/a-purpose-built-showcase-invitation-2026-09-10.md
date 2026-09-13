# A purpose-built showcase invitation

Keep the "See a real invitation" card on the business card, but point it at a brand new fictional event instead of the Kendrick Family Reunion. The reunion holds 210 real family records; a showcase built entirely from invented people carries no privacy risk and never needs re-auditing.

## The event

One aspirational, plausible event, invented from top to bottom: **"The Marchetti–Bell Wedding"** style milestone celebration, hosted by two fictional hosts, at a fictional venue with an invented address and phone numbers in the reserved 555 range. Fictional guest list of roughly 40 names with a realistic spread of yes / maybe / pending, plus-ones, and dietary needs.

Every feature the product sells is switched on and populated so a stranger sees the whole system in one scroll:

- entrance animation (bouquet, since it is a wedding)
- host voice note
- read-aloud narration, pre-generated in the current default voice
- a Sound Studio song attached to the event
- a poem or letter attached
- photo wall with invented, generated imagery
- run of show, countdown, add-to-calendar
- RSVP with plus-ones and dietary needs
- seating chart, bring list
- well wishes and comments, pre-populated with invented examples
- a playlist link

## The lockdown line

Interactive where the result is private to the viewer, read-only where the result is public.

**Allowed, and it feels real:** pressing RSVP and seeing the confirmation, opening the seating chart, playing the narration and music, browsing the photo wall, opening the run of show, add-to-calendar, the countdown. None of it is written anywhere.

**Blocked:** posting a comment, posting a well wish, uploading a photo, claiming a bring-list item. Those surfaces still render with their invented content so the feature is visible, with the input replaced by a short, calm line explaining that the sample is read-only.

Enforced in two places, prevention first:

1. **Server side.** A single `isShowcaseEvent(eventId)` check inside every public write server function for this event (`postWellWish`, `postEventComment`, `uploadEventPhoto`, `submitGuestRsvp`, `quickRsvp`, bring-list claims, contact capture). They return a friendly refusal rather than writing. This is the real protection: even a crafted request cannot write.
2. **Client side.** Showcase mode hides or disables the write controls and answers RSVP locally so the confirmation still appears.

The nightly demo reset stays as the safety net only. The event is flagged as demo data so it never enters any report or count, and it is added to the preserved list so the reset never deletes it.

## The funnel bits Christopher asked for

- **Measurement.** The showcase reuses the existing invitation-open tracking and card-scan attribution, so the owner console can show how many people opened it and what they pressed, next to the QR scan numbers.
- **One clear next step.** A single closing panel: start your own event, or get in touch. Not a dead end.
- **Say it is a sample.** One small elegant line near the top, confident rather than apologetic, and a matching note in the page metadata.
- **Fast on a phone.** All showcase imagery generated at web sizes and compressed to the same standard as the reunion page fix. Load time reported on a throttled connection.
- **Repoint `/card`.** The default destination for the "See a real invitation" action becomes the showcase, and the printed `/card` code keeps working unchanged.

## Verification

Checked as an anonymous visitor on a 390-wide phone viewport, on a throttled connection:

- the invitation renders fully and reveals no real names, emails or phone numbers
- RSVP confirms on screen and writes nothing
- comment, well wish, photo upload and bring-claim are all refused, both in the interface and when the request is sent directly
- the showcase appears in no report or count
- load time recorded and reported

## Technical notes

- New `src/lib/showcase.ts` with the showcase event id and `isShowcaseEvent()`, imported by both the write server functions and the invitation page.
- The event row is seeded by a migration into the Demo Host account with `is_demo: true`, and its id added to `PRESERVED_DEMO_EVENT_IDS` in `src/lib/demo-seed.server.ts`.
- Narration is pre-generated once and cached under the voice-aware path, so no speech call happens on a visitor's first load.
- `DEFAULT_CARD_DESTINATION` in `src/lib/card-link.ts` stays the personal card; the card page's secondary action switches to the showcase.

Standing rules respected: no database restore, no publishing, nothing in live Stripe, no real email or SMS, no test data left behind.
