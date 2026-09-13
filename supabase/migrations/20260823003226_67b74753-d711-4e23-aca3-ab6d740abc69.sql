INSERT INTO public.product_updates (title, emoji, body_html, audience_tier, status, published_at)
VALUES (
  'Photo Wall is live and working',
  '📸',
  '<p>Photo Wall now works end to end on Atelier gatherings. Guests can add photos straight from the invitation with no account, the wall updates for everyone watching without a refresh, and there is a full-screen TV mode with a scan-to-add code for the venue screen.</p><p>Hosts can hide or remove any photo, download every photo as a zip after the party, and add their own licensed music for the slideshow.</p>',
  'all',
  'published',
  now()
);

INSERT INTO public.dev_changelog (title, body_md, category, severity, files, published_at)
VALUES (
  'Photo Wall: missing table grants and owner permission gap',
  E'Root cause of the broken Photo Wall:\n\n1. `event_photos`, `event_photo_rate_limit` and `event_wall_music` were created with RLS policies but **zero GRANTs**, so every Data API read/write returned permission denied.\n2. `can_edit_event()` only returned true for invited co-hosts, never the event owner, so the host moderation panel threw "You don''t have access to this event." Redefined as `owns_event() OR cohost`.\n\nVerified live: anonymous upload via server fn, second-viewer wall render, host hide flips the photo out of `get_public_event_photos`.',
  'bugfix',
  'high',
  ARRAY['src/lib/photo-wall.functions.ts','src/components/photo-wall-panel.tsx'],
  now()
);