# Restore demo sign-in persistence

## Implementation
- Return the real refresh token from the existing rate-limited, logged demo sign-in function.
- Keep all identity-based demo restrictions unchanged.

## Verification and cleanup
- Test a clean browser visit to `/demo`, dashboard sample visibility, reload persistence, a demo event, the showcase, cookie-cleared send refusal, and `/demo?off=1` exit.
- Verify the refusal was logged, then delete only the guard-log rows created by this test.
- Report whether this regression was the last publishing blocker in this run.

## Boundaries
- Do not publish, send messages, use live payments, restore data, or touch `sm7eduqe`.
- Do not implement the queued CSV visibility or Sound Studio authorization work in this run.
