# End-to-end tests (Playwright)

Smoke tests that exercise critical user flows against the running app.

## Running locally

```bash
bun add -D @playwright/test
bunx playwright install --with-deps chromium
bunx playwright test
```

## Adding a test

1. Drop a new `*.spec.ts` file under `tests/e2e/`.
2. Use the `test`/`expect` imports from `@playwright/test`.
3. Prefer **role-based** locators (`getByRole`, `getByLabel`) over CSS selectors.

## What belongs here

- Checkout flows (Stripe embedded form mounts, discount codes apply)
- Auth flows (sign up, sign in, password reset)
- Critical guest paths (invite acceptance, RSVP, check-in)

What does **not** belong here: anything testable as a unit test. E2E is slow and
flaky — reserve it for flows where the integration *is* the value.
