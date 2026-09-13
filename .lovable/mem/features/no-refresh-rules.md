---
name: No refresh / no reload rule
description: Every change must preserve SPA state — never force page reloads, never wipe typed form/event/designer state. Audit after every change.
type: preference
---
# No-refresh rule (applies to every change)

After every edit anywhere in the app, run a quick audit to confirm no new hard reloads were introduced.

## Always verify work before finishing
- For UI fixes, test the affected desktop/mobile viewport with Playwright or preview tools before telling the user it is fixed.
- For repeated user-reported issues, reproduce or inspect the visible state first, then verify the exact symptom is gone after changes.
- Floating controls must remain movable, non-overlapping, and clean on mobile.

## Forbidden patterns
- `window.location.reload()`
- `window.location.href = "/some-route"` (use `useNavigate` / `<Link>`)
- `window.location.assign(...)` / `window.location.replace(...)` for in-app routes
- `<a href="/...">` for internal navigation (use `<Link to="...">`)
- `<form>` submits without `e.preventDefault()` on app forms
- Auth state listeners that call `router.invalidate()` on `TOKEN_REFRESHED` / `INITIAL_SESSION` (causes silent re-fetch storms; filter to identity transitions only)
- `router.navigate({ href: ... })` for internal routes in TanStack Router — `href` triggers a full page load. Use `router.navigate({ to: ... })` for client-side navigation.

## Allowed exceptions
- `window.location.href = "sms:..."` / `mailto:...` / `tel:...` (device deep links — not page navigation)
- External http(s) URLs opened with `target="_blank"`
- Stripe-hosted checkout redirects (when explicitly used)

## Audit command (run after any change)
```
rg -n "window\.location\.(reload|href\s*=|assign|replace)" src/ -g '*.tsx' -g '*.ts'
rg -n "router\.navigate\(\{ href:" src/ -g '*.tsx' -g '*.ts'
```
Every hit that is not a `sms:` / `mailto:` / `tel:` / external `https://` link is a bug. Replace with `useNavigate` / `<Link>` / `router.navigate({ to: ... })` or remove.

## State preservation
- Event creation forms, the AI Packages panel, the Design Studio editor, and the support widget MUST preserve typed content across re-renders. Never reset state in a `useEffect` that runs on auth changes.
- The Design Studio autosaves to `design_assets` on a debounce; do not rely on `beforeunload` prompts.
