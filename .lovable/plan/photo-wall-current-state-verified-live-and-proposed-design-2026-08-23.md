# Photo Wall: current state (verified live) and proposed design

## 1. How it works today

**Routes**
- `/wall/:eventId` — the display wall (rotating slideshow, 6s per photo, polls storage every 12s), plus an on-screen QR code pointing at the upload link.
- `/wall/:eventId/upload` — the guest upload page (file picker with `capture="environment"`, 20MB cap, HEIC rejected with instructions).
- Host entry point: the Share hub card ("Open slideshow", "Copy guest upload link", printable QR).

**Gating**
- Both routes call `getPhotoWallAccess` → `get_event_public_entitlements` RPC, which returns true if the event owner has an active Atelier / Studio Collective subscription (non-trial price ids) OR the event has the legacy `photo_wall` add-on row. `tier-config` marks `photoWall: true` for Atelier only. So: Atelier-inclusive, with legacy purchases grandfathered. That part is correct.

**Storage**
- Public bucket `event-photos`, objects at `${eventId}/${timestamp}-${rand}.ext`.

## 2. Verified live: Photo Wall is currently broken end to end

I probed the live backend directly rather than reading code.

- **Guests cannot upload at all.** The only INSERT policy on `event-photos` is granted to `authenticated` and additionally requires the uploader to be the event owner or a contact whose email matches a linked contact row. An anonymous guest with the invite/QR link gets:
  `403 Unauthorized — new row violates row-level security policy`.
- **Nothing would display even if upload worked.** There is no SELECT policy on `storage.objects` for `event-photos`, so `storage.list()` returns an empty array for anon *and* for signed-in hosts. The wall would sit on "No photos yet" forever, silently (the code only shows its error state on a hard error, and RLS returns an empty list, not an error).
- **Confirmation:** `event-photos` contains **0 objects, across 0 events, all time.** No one has ever successfully put a photo on the wall, so an Atelier customer today gets a working-looking page that can never fill.

This is a different bug from the entitlement/permissions gap fixed earlier tonight (that one was the `subscriptions`/`event_addons` anon read gap, now handled by the SECURITY DEFINER RPC). The gate now answers correctly; the storage layer behind it was never opened.

**Also drifted:** the Share hub locked-state copy still says "included with Host & Atelier, or add it below for $9", and the comment in `branding.functions.ts` says Host/Atelier. Both are stale versus the retired purchase path and the Atelier-only gate.

**Moderation:** does not exist. The only DELETE policy is `owner = auth.uid()`, i.e. the uploader's own object. A host cannot remove a guest's photo. There is no bulk download/export either.

## 3. Fixes required before any new feature (this is the real work)

1. **Photo records table** `event_photos` (event_id, storage_path, uploader_label, status `visible|hidden|removed`, created_at, ip_hash). Driving the wall off a table instead of `storage.list()` is what makes moderation, ordering, live updates, and rate limiting possible at all; a bare bucket listing supports none of them.
2. **Guest upload through a server function**, not direct-from-browser storage writes: validate the event exists, is not archived, and has Photo Wall entitlement; validate mime/size; write the object with the service role; insert the row. Keeps `anon` off `storage.objects` entirely.
3. **Rate limiting** (confirming your recommendation): per-IP-hash and per-event windows in the same shape as `ecard_rate_limit` / `guest_privacy_rate_limit` — proposed 10 photos / 10 min per IP, 300 per event per day, 20MB per file. Cheap, and the abuse surface here (public writeable image bucket) is the worst one on the platform.
4. **Host moderation panel** on the event page: grid of submissions with Hide (drops off the wall, keeps the file) and Remove (deletes the object). Reuses the Well Wishes moderation pattern.
5. **Bulk download** (confirming your recommendation): a "Download all photos" action that streams a zip of the event's visible photos. Also propose keeping files for 90 days after the event date with a clear notice, rather than indefinite storage growth.

## 4. New features proposed

### Slideshow mode (TV-friendly)
`/wall/:eventId?tv=1` — a display variant of the existing wall, not a new route to maintain:
- No hover chrome, no buttons, no "Back to invite" link, cursor auto-hidden after 3s.
- Ken Burns slow zoom/crossfade between photos, 8s per photo, portrait photos matted against a blurred copy of themselves so nothing letterboxes into black bars.
- Persistent corner card: event title + QR to the upload link + short URL, so late arrivals learn how to join mid-slideshow. Sized for reading from ~10 feet.
- Wake-lock (`navigator.wakeLock`) so the laptop driving the TV does not sleep, and auto-recovery if the network blips.
- New photos appear without a refresh: replace the 12s poll with a Supabase realtime subscription on `event_photos`, and inject a newly arrived photo as the next slide so a guest sees their own photo within seconds of uploading. (Today it needs up to 12s and only via polling.)

### Universal access via the invitation
Add a "Photo Wall" section to the invite page for entitled events: "Add your photos" (upload) and "View the wall". Fully account-free, matching tonight's other guest-facing flows. Guest label is optional free text, or prefilled from the guest-lookup match when available so hosts know who sent what.

### Music — my read: allow host-uploaded audio only, and I would keep it narrow
Your instinct is right and I'd go further. Letting hosts attach arbitrary audio makes us the host of infringing copies, and a wall running at a public venue with a chart song playing is a public-performance issue on top of the copy itself. Popular-track integration also isn't legally available to us: Spotify/Apple APIs do not license background audio for third-party slideshows.

Proposed, safe version:
- Host uploads their own file (mp3/m4a/ogg), one track or a short list, **10MB / 5 minutes per file, 3 files max**.
- A required checkbox affirming they own or are licensed for the track, stored with timestamp in a consent log (same pattern as the existing purchase/SMS consent logs), giving us a takedown-able record.
- Audio never plays on the guest upload page and never auto-plays anywhere except TV mode, and only after the host clicks once (browsers block autoplay audio anyway).
- Playback muted by default with an obvious unmute control; volume persisted per device.
- Explicitly **not** building: URL-pull from YouTube/Spotify/SoundCloud, or a built-in music search.
- Optional nice-to-have later: a small bundled royalty-free set we license once, so the safe path is also the easy path.

## 5. Suggested order

1. Storage/RLS + `event_photos` table + server-side upload + rate limiting (makes the paid feature actually work).
2. Host moderation panel + bulk download; fix the stale $9/Host copy.
3. Realtime updates + invite-page access.
4. TV slideshow mode.
5. Host-uploaded music with the consent gate.

Steps 1 and 2 I'd treat as a bug fix rather than a new feature: an Atelier customer is paying for this today and it cannot work.
