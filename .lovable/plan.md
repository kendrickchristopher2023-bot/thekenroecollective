# Make meeting credentials mandatory in every Schedules message

## Decisions
- Add dedicated `meeting_id` and `meeting_passcode` fields to `schedules`.
- Keep `dial_pin` unchanged because it belongs to the dial-in phone number and may differ from the online meeting passcode.
- Treat the new fields as optional for schedules without online meeting credentials, but whenever either exists, render it with the join details everywhere.
- Preserve existing templates and long links. The sender will enrich their output automatically, so old reminder steps remain compatible.

## Database and compatibility
- Add nullable `meeting_id` and `meeting_passcode` columns in one additive migration. No table, policy, grant, or existing column changes are needed.
- In that same migration, update only schedule `3e9d32bc-f47f-4b78-9fb4-7e08e54f6e5f`, setting `meeting_id = '628 671 9107'` and `meeting_passcode = '121212'` only when the values are still blank and the saved schedule details match the supplied values.
- Apply the migration to the live database as required by the project rules, then verify the published sender still reads and processes schedules because the change is additive.
- Confirm the protected reunion schedule's people, reminder steps, welcome fields, and pending manual row `a5835a12` are byte-for-byte unchanged apart from the two permitted schedule columns.

## Meeting field entry
- Add clear **Meeting ID** and **Passcode** inputs beside the meeting link, while retaining the existing dial-in number and dial-in PIN fields.
- Add a shared browser-safe parser for Zoom, Google Meet, and Microsoft Teams links.
- Auto-fill Meeting ID only when its input is blank:
  - Zoom: digits after `/j/`, formatted in familiar grouped form such as `628 671 9107`.
  - Google Meet: the meeting code from a standard Meet URL.
  - Teams: the meeting identifier when present in a recognized Teams URL.
- Never treat Zoom's `pwd=` value as the passcode.
- Run the same derivation during server-side save as a fallback, so bypassing the form cannot create inconsistent data.

## One shared rendering rule
- Extend merge fields with `{meeting_id}` and `{passcode}`.
- Build one shared join-details formatter used by texts, emails, the personal page, and calendar files.
- When `{join}` is rendered, follow the link with labeled Meeting ID and Passcode lines when available.
- If a template explicitly places `{meeting_id}` or `{passcode}`, or already contains the same labeled value through `{description}`, suppress the automatically appended duplicate.
- Support link-only, dial-in-only, and no-join-details schedules without empty labels or awkward blank lines.

## Text delivery and previews
- Route automatic reminders, welcome texts, Send now, and schedule text-reply confirmations through the same enriched renderer.
- Keep required items protected during the 480-character limit: join link, Meeting ID, Passcode, and RSVP link are retained in full. Shorten only optional/free-text content first, then preserve compliance and host lines under the existing rules.
- Update reminder, welcome, and Send now previews to use the real shared renderer, including exact character and segment counts.
- Preserve the welcome-label fix: welcomes remain unlabeled, while reminders and Send now keep `Reminder:`.

## Email, personal page, and calendar
- Add Meeting ID and Passcode as labeled lines directly below the Join button in schedule emails.
- Add the same labeled lines below the Join button on the personal RSVP page.
- Include normalized join URL, Meeting ID, Passcode, dial-in details, and description in calendar file descriptions without duplicate credential lines.

## Verification
- Add focused unit tests for reminder, welcome, Send now, reply-confirmation, and email rendering with:
  - join link plus Meeting ID and Passcode,
  - dial-in number only,
  - no join information,
  - explicit `{meeting_id}` and `{passcode}` placement,
  - credentials already present through `{description}`,
  - a long message proving protected links and credentials survive the 480-character limit.
- Test Zoom, Google Meet, and Teams Meeting ID extraction, Zoom formatting, blank-only auto-fill, and rejection of `pwd=` as a passcode.
- Test personal-page data and calendar descriptions for the same three join-detail cases.
- Record the `sms_outbox` count before and after. Use rendering and dry-run tests only, with no outbox inserts.
- Render, but do not send, the next reminder for schedule `3e9d32bc-f47f-4b78-9fb4-7e08e54f6e5f` and report the exact body plus character and segment counts.
- Run focused tests, type checks, and a clean preview build check. Verify no unexpected navigation or page reload was introduced.
- Do not publish.
