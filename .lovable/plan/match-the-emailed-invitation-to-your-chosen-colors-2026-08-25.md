# Match the emailed invitation to your chosen colors

You're right that it doesn't today. The invitation page uses your "Card & border color" and "Invitation text color", but the emailed invitation is hardcoded to the default maroon and cream. Texted invites are plain SMS (a short line plus the invitation link), so color can't apply there, only in email and on the linked invitation page.

## What changes

- The invitation email inherits the event's card/border color for the card border, the "You're invited" eyebrow, the date line, the RSVP button and the link color.
- If a custom invitation text color is set, the event name, date and venue in the email use it too.
- The host crest/logo, when set, appears at the top of the email like it does on the invitation.
- Readability safeguard: if a chosen color is too light against the cream email background, the email falls back to a darker readable shade of the same hue rather than shipping unreadable text. Button text switches between white and dark ink based on contrast.
- Events with no color chosen look exactly as they do now.

## Technical notes

- `src/lib/events-invites.functions.ts`: add `accentColor` (`event.color`), `textColor`, and `logo` to the `templateData` passed to the `event-invite` template.
- `src/lib/email-templates/event-invite.tsx`: accept those props, replace the hardcoded `#8a1a1a`/`#5c1d1d` constants with style factories derived from the accent, keep inline styles only (no CSS vars, email clients drop them), keep `Body` background `#ffffff` per email rules.
- Add a small contrast helper (relative-luminance check + darken) used by the template; unit-test it and add a template render test alongside `tests/unit/email-registry.test.tsx`.
- Verify with the template preview render for a light accent (`#a8803a`), a dark accent, and an event with no color set.
