# Invisible email button + silent password save

## What's wrong

**1. The reset button disappears in iCloud dark mode.** The button in the email is styled as white text on a black background. Apple Mail's dark mode re-colors dark backgrounds against a dark canvas, so the button blends into the black background and becomes effectively invisible — the link is still there, just unreadable. Every auth email in the app shares this same button style, so confirm/magic-link/invite emails have the same problem.

**2. Saving a new password gives almost no feedback.** On the profile page, the password update only writes a small grey line of text under the form ("Password updated") in the same muted color as the helper text, with no toast and no button state change. Nothing tells you clearly that it worked, and the button doesn't disable while saving — so a slow save looks like nothing happened.

## The fix

### Email button visibility (all auth emails)
- Rebuild the call-to-action as a bordered, table-based button with an explicit light-on-brand color pair that survives dark-mode re-coloring: brand gold/oxblood fill, dark text, plus a visible border so its edges are defined on both white and black backgrounds.
- Add `color-scheme` / `supported-color-schemes` meta to the email head so Apple Mail keeps the declared colors instead of inverting them.
- Add a plain-text fallback line under every button ("Or paste this link into your browser:" followed by the URL) so the email is never a dead end even if the button fails to render.
- Apply to all six auth templates (reset, confirm signup, magic link, invite, email change, reauthentication) plus the app emails that use the same button style.

### Password save feedback
- Show a success toast on save and an error toast on failure, matching how the rest of the app confirms actions.
- Disable the button and show "Updating…" while the request is in flight.
- Make the inline result message clearly colored (green success / red error) instead of muted grey, and clear it when typing resumes.
- Same treatment for the standalone reset-password page so both paths behave identically.

## Anything else worth flagging

- **The reset link expires.** If several reset emails are sitting in the inbox, only the newest one works — older ones will fail with a confusing error. Worth using the most recent.
- **MFA gate is still waiting.** Once you're signed in, `/owner` requires enrolling an authenticator app, since that account is a super admin.
- **Emails render on a white card by design.** Email clients handle dark mode inconsistently, so the templates intentionally keep a light background; the fix makes the button readable within that rather than switching the email to dark.

## Technical notes

Auth templates live in `src/lib/email-templates/` (`recovery.tsx`, `signup.tsx`, `magic-link.tsx`, `invite.tsx`, `email-change.tsx`, `reauthentication.tsx`). The shared button style constant is duplicated per template; it will be replaced with a single shared button/link block so future templates can't regress. Password feedback changes are in `src/routes/_authenticated/profile.tsx` (`changePassword`) and `src/routes/reset-password.tsx`, using the existing `sonner` toast already in the app. No backend, queue, or sender-domain changes are involved.
