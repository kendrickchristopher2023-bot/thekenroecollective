# Soundtrack extras: credit line, regenerate, reuse, length label, transport controls

Five additions to the Photo Wall soundtrack and invitation song, all confirmed by Christopher.

## 1. Artist / credit line on AI songs

- Optional "Credit / artist" field on the compose form (e.g. "Composed for Tenia's Birthday"), stored as `artist` on the music row (new nullable column on `event_wall_music`, or reuse `link_title`-style field — pick the column route so it shows everywhere).
- Shown in the soundtrack list, on the wall now-playing label, and carried to the invitation as `songArtist` when "Use on invitation" is pressed.

## 2. Regenerate keeping the name

- "Regenerate" action on each AI song: re-runs ElevenLabs with the same prompt/settings/name/credit, keeps the old version until the new one is ready, then replaces the audio in place.
- If the song is attached to an invitation (`songUrl` matches), the invitation keeps working — the file is overwritten at the same storage path so the link, name, and download filename stay put. One tap, no re-attaching.
- Counts against the same per-event AI cap (replacement, not a new song), and each regeneration is a real ElevenLabs call.

## 3. Reuse a song across events

- "From another event" picker in the Soundtrack section: lists AI songs you composed on your other events (owner audience only, same as the rest of the feature).
- Selecting one copies the audio file into this event's storage and adds a row — guests on this event can play it, and it costs nothing to "generate" since no new AI call is made.
- Respects the per-event AI cap (3).

## 4. Length label per track

- Show duration (e.g. "0:30") next to each track in the soundtrack list. Uploads already measure `seconds` at analysis time; AI songs are a known 30s default; store the measured value and format it.

## 5. Transport controls (play, pause, stop, next, previous)

- The invitation song card already has native play/pause/seek/volume via `<audio controls>` on every device — nothing needed there.
- The Photo Wall player currently has only start/stop. Add a small transport bar to the wall and TV mode: pause/resume, stop, next track, previous track. Pause suspends the Web Audio clock (so crossfade scheduling stays correct); next/prev restart the scheduler at the chosen index. True rewind/fast-forward *within* a track is not practical in the crossfade Web Audio graph, so skip/prev covers track navigation; guests on the invitation keep full seek via the native player.

## Technical notes

- `event_wall_music`: add `artist text null` (and `seconds int null` if not already stored); migration with GRANT/RLS re-verified after apply. Public read stays as-is.
- `generateWallSong` gains optional `artist`; new `regenerateWallSong` server function (owner-gated like the other five writes) reusing the stored `prompt`/`settings`; new `copyWallSongToEvent` server function validating both events belong to the owner.
- `wall-music-player.tsx`: pause via `ctx.suspend()`/`ctx.resume()`, stop via existing `stopAll`, next/prev adjust the scheduler index and restart `playFrom`. Transport UI on `wall.$eventId.index.tsx` (and TV mode), muted-by-default and tap-to-start behavior unchanged.
- Tests: regenerate keeps name and replaces URL in place, reuse copies across events and respects caps, credit line flows to invitation, pause/next/prev scheduler logic, length formatting. Extend `tests/unit/wall-soundtrack-panel.test.tsx` and `wall-soundtrack-access.test.ts`.
- Verify in the browser at phone width: compose with a credit, rename, regenerate, attach to invitation, wall transport buttons, and invitation playback.

## Safety

No sends, no publish, no changes to Tenia's event or `mrsmkendrick@gmail.com`'s event. Self-created test events only, deleted afterwards.
