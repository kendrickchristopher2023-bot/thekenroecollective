# Close out the public media bucket finding

Make the legacy `atelier-media` bucket private so uploaded files can no longer be fetched by guessing a URL.

## Current state

- All upload code paths now write to the newer `atelier-shared` bucket (invitation art, menu icons, design studio images, AI package images, converted media).
- Sensitive support/concierge attachments already live in the private `atelier-media-private` bucket and are served via short-lived signed URLs.
- The single object that was in `atelier-media` was already re-homed, so the bucket holds nothing that a live page depends on.

## What will happen

1. Flip `atelier-media` from public to private.
2. Re-check that no remaining code or database row points at `atelier-media` for a public URL; if any is found, repoint it at `atelier-shared`.
3. Confirm the guest-facing surfaces still render: invitation/announcement art, event menu icons, design studio images, AI package images.
4. Mark the security finding `atelier_media_public_bucket_negates_rls` as fixed and refresh security memory so the bucket is no longer described as an accepted public-read exception.

## Technical notes

- Bucket visibility is changed through the storage bucket settings tool, not SQL against `storage.buckets`.
- No RLS policy changes are required: the existing owner-scoped policies on `storage.objects` become the only access path once the bucket is private.
- `atelier-shared` stays public by design (no listing/read policy of its own) because invitation and announcement images must load inside emails and on public share links.
