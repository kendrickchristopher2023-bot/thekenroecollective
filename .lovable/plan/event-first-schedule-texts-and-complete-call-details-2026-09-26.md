# Event-first schedule texts and complete call details

## Recommended message structure

Use the event name as the first thing recipients see:

```text
Kendrick Family Reunion Call
Hi Chris, our next call is Sun, Oct 4 at 4:30 PM EDT.
Will you be there? [personal link]

Sent with The Kenroe Collective for Chris.
Reply STOP to opt out.
```

- Lead every reminder with the schedule name so familiar recipients recognize it immediately.
- Treat “Sent with The Kenroe Collective” as a light attribution, not an advertisement or image watermark. Show it on the first text to each person, alongside the required sender identification and STOP language. Do not repeat it on every later reminder, which saves SMS segments and keeps messages personal.
- Keep the personal RSVP link on its own line so phones do not visually join it to the STOP sentence.
- Keep meeting IDs and passcodes on the private linked page by default. Texting credentials in every reminder increases exposure and message length.

## Build

### 1. Fix and complete the personal schedule page
- Render the saved schedule description, preserving line breaks, so meeting ID, passcode, and host notes are visible.
- Present join details in a clear “How to join” area: primary join button, meeting description/details, dial-in and PIN, and location when available.
- Normalize join links when saved and when displayed so entries such as `www.zoom.com/...` open as secure external links instead of a broken relative page.
- Keep RSVP choices prominent and retain the existing host contact block and Kenroe attribution.
- Do not reveal contact data or meeting details in page metadata, errors, or the inactive-link screen.

### 2. Make schedule texts event-first
- Change the first-text compliance wrapper so the schedule title appears before sender/service identification.
- Preserve host identification and the required STOP instruction on the first text.
- Put the RSVP URL and STOP instruction on separate lines.
- Apply the same formatter to automatic reminders, welcome texts, nudges, and Send now, without bypassing quiet hours, consent, opt-outs, caps, demo protection, or the shared outbox.
- Keep short RSVP confirmation replies unchanged and concise.

### 3. Improve host controls and previews
- Add `{description}` as an optional merge field for hosts who deliberately want selected details in an email or text.
- Include the description in email content only when the host uses that merge field; do not silently add credentials to every outgoing message.
- Make the first-text preview show the exact event-first introduction, Kenroe attribution, line breaks, STOP text, final character count, and estimated SMS segments.
- Warn when a draft is long enough to create several SMS segments, while still allowing the host to save it.

### 4. Handle links safely
- Accept complete `http://` and `https://` links.
- Convert common scheme-less web addresses to `https://` before storage.
- Reject values that cannot be made into a safe web link, with a plain correction message beside the field.
- Preserve already-saved valid links and avoid changing any real schedule during deployment.

## Verification

- Unit-test event-first first messages, later reminders, Kenroe attribution, STOP placement, merge fields, truncation, and SMS segment counts.
- Test welcome, automatic, nudge, and Send now previews without sending any email or text.
- Test complete and shortened personal tokens: valid links show the schedule; invalid links remain private and show the inactive message.
- Test descriptions containing meeting IDs, passcodes, line breaks, long words, and links.
- Test `www...`, `https://...`, invalid, and potentially unsafe join-link inputs.
- Verify RSVP submission still works without a reload or loss of a typed note.
- Verify no reminder guard, outbox behavior, live schedule data, contacts, or existing tokens change.
- Run the full type check and focused tests, then visually verify the page and message preview at phone and desktop widths.
- Do not send real messages, alter the reunion schedule, publish, or modify live data.

## Scope

This update changes message presentation, link safety, and the personal schedule page only. It does not change recurrence, delivery timing, consent rules, reply routing, or Checkpoint 2 behavior.
