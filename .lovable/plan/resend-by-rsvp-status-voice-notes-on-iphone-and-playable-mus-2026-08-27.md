# Resend by RSVP status, voice notes on iPhone, and playable music links

## 1. Send and resend to exactly who you choose (email and text)

Today a single guest row has a Resend button, and the Share Hub can send to "not yet invited" or "everyone already invited". There is no way to say "everyone who hasn't responded" or "everyone who said maybe". The text panel is worse: its only filters are attending, pending, and all, so "maybe" and "declined" cannot be targeted at all, and there is no way to text one person.

New shared audience picker used by both email and SMS:

- Filter chips: No response yet, Yes, Maybe, No, Everyone
- Live count plus checkboxes so you can hand-pick or deselect individuals inside the filter
- Search box to jump to one person
- Each row shows last invited date and last texted date, so you can see who has already heard from you
- Confirmation step before sending, listing the count and a sample of names (already the pattern for bulk email)

Email side: reuses the existing invite server function with the selected guest IDs, so every guest keeps their personal RSVP link.
SMS side: the same picker feeds the existing queue, and adds a per-guest "Text" action on each guest row.

## 2. Voice greeting does not play on iPhone

Confirmed cause: the voice greeting recorder saves WebM/Opus when recorded in Chrome on a laptop. iPhone Safari cannot decode that format at all, so the player shows up but stays silent. This project already solved the exact same problem for eCard voice notes with a WAV encoder.

Fix: route the event voice greeting through that same WAV path, so recordings and uploaded audio files are always saved as a format every phone can play. Also add a one-time repair for existing WebM greetings: when the invite page detects an unplayable greeting, the host sees a clear "re-record for iPhone guests" prompt in the editor instead of guests hearing silence.

## 3. Apple Music / Spotify link does not play

Confirmed: the playlist field is only a link. On the invite it renders as "Open playlist", which sends guests out to another app, and nothing plays on the page.

Fix: turn a pasted Apple Music or Spotify link into an actual embedded player on the invitation (Apple Music and Spotify both provide official embeds). Guests get a play button in place. Links from services with no embed keep the current "Open playlist" button, and Apple Music previews are 30 seconds unless the guest is signed in to Apple Music, which the page will say plainly.

Separately, the Photo Wall slideshow music is upload-only by design (licensing), so streaming links will not work there. The wording there will be made explicit rather than changed in behavior.

## 4. Other things worth fixing (from this pass)

- The voice greeting uploader accepts any audio file with no size or length check, so a long file can be attached and quietly fail to load for guests.
- The uploader reads duration through a temporary audio element and silently records 0 seconds on failure, which is why some greetings show no length.
- The SMS panel counts opted-out numbers but does not show which guests are opted out; the new picker will mark them and exclude them from the count.

## Technical notes

- New `src/components/guest-audience-picker.tsx`: status filters, search, per-guest selection, returns guest IDs. Consumed by `share-hub.tsx`, `master-guest-report.tsx`, `sms-reminders-panel.tsx`, and the guest row.
- Email path unchanged server-side: `sendEventInvites({ eventId, resend: true, guestIds })` in `src/lib/events-invites.functions.ts`; every send continues to log to `email_send_log`.
- SMS path unchanged server-side: `queueSms` in `src/lib/sms.functions.ts`, with opt-out filtering preserved.
- Voice greeting: `VoiceMessagePanel` in `src/routes/events.$eventId.index.tsx` switches from raw `MediaRecorder` WebM to `startPcmRecording` / `fileToWav` in `src/lib/wav-audio.ts`; `VoiceNotePlayer` in `src/routes/invite.$eventId.tsx` reports an unplayable source instead of failing silently.
- Playlist embed: small helper mapping `music.apple.com/...` to `embed.music.apple.com/...` and `open.spotify.com/...` to `open.spotify.com/embed/...`, rendered in the invite extras block with a strict allow-list of those two hosts.
- No schema migrations, no pricing or tier changes, no auth changes.
