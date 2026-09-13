# Storage listing privacy fix

## Changes
- Confirm every browser storage call for `event-photos` and `ecard-media` is insert-only with unique names, and that deletes/downloads run through protected server functions with privileged storage access.
- Add and apply one migration that drops these SELECT policies only:
  - `Public read of event photo files`
  - `ecard media public read`
  - `Public read for site-films`
- Add no replacement SELECT policy unless the audit finds a browser operation that genuinely needs one.

## Verification
- Call each bucket's list endpoint while signed out and confirm it returns no object names.
- Load one existing public URL from each bucket and confirm public delivery still works.
- On the demo account only, upload and delete a wall photo, upload an eCard photo and voice note, then delete every test file and row.
- Confirm the storage mirror and nightly backup use privileged access and remain unaffected.
- Recheck the three policies are absent and report exact outcomes. Do not publish.

## Technical details
- The migration changes policies on `storage.objects`; it does not change bucket visibility or object bytes.
- Public object URLs continue through each public bucket without a row-level SELECT policy.
- No application code changes are expected unless the audit finds a browser-side SELECT dependency.
