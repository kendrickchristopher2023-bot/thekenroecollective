# Add "Reminder:" to Schedules texts

## What the user asked
Should the word "Reminder" appear in the text messages so guests know at a glance these are reminders? Will it make the message too long?

## Answer
Yes, add it. It costs 10 characters. The current reunion text is 313 characters (3 segments); 323 is still 3 segments, so no extra send cost for this schedule. The preview's segment counter shows the exact count before every send, so any schedule near a boundary stays visible and editable.

## Changes

### 1. Message composer (src/lib/schedule-messages.ts)
- In `composeScheduleSms`, add an option `leadLabel?: string` (default `"Reminder"`) that renders the first line as `Reminder: {title}` instead of just `{title}`.
- Welcome messages pass a different label (`Welcome`) or none, since a welcome is not a reminder; reminders, auto steps, nudges and Send now keep `Reminder`.
- If the saved template body already starts with the title, keep existing behavior; the label still leads the first line.
- No changes to email subjects (they already say "Coming up next week", which is reminder-like).

### 2. Tests (tests/unit/schedule-messages.test.ts)
- Assert the composed text starts with `Reminder: {title}` for reminder and Send now paths.
- Assert welcome path does not say "Reminder".
- Assert segment count stays within budget on a realistic 320-character sample.

### 3. Verification
- Typecheck and run the message unit tests.
- Preview screenshot of the Send now panel and a reminder step showing the new first line and segment count (3 segments expected for the reunion text).
- No live sends, no database changes, no publish.

## Not changing
- The STOP line, compliance intro, host contact line, personal RSVP link, meeting details, or any template wording the host has saved.
- Nothing on the reunion schedule's data itself; the change is to how texts are presented.
