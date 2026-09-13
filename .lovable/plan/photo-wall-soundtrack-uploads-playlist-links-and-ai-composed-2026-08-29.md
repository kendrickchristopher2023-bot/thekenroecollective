# Photo Wall Soundtrack: uploads, playlist links, and AI-composed songs

## What you get

A single "Soundtrack" section for the Photo Wall that does three things:

1. **Upload your own music** from your PC (mp3/m4a/ogg/wav), multiple tracks, drag to reorder.
2. **Paste a Spotify / Apple Music / Amazon Music playlist or song link.** The wall shows a tasteful "Now playing on Apple Music" card with cover art and a tap-to-open button, and guests can open it in their own app. It does not play the audio through our page, because none of those services license their audio for playback under third-party slideshows. Trying it would get the feature pulled and expose you to claims. The link card is the version that is both legal and useful.
3. **Compose an original song with AI.** You type a few words (or let it read your event details), pick genre, mood, tempo, vocal type, and brightness/bass, and get a real, original track you own the use of, generated in about 30-60 seconds. This is the differentiator: nobody else lets a host generate a custom song for their event's photo slideshow.

Plus the playback intelligence you asked for:

- **Auto-repeat and gap-free looping.** If there are 60 photos and only 2 tracks, the playlist loops seamlessly with crossfade instead of stopping or restarting abruptly.
- **AI-chosen transitions.** For every track pair, we pick the transition (crossfade length, or a beat-matched cut) from the tracks' own measured energy and tempo, so a slow ballad into an upbeat track doesn't jar. Analysis happens once per track at upload/generation time and is stored, so playback costs nothing extra.
- **Photo pacing follows the music.** Slide duration snaps to the track's bar length, so photos change on the beat instead of drifting against it. This is the part that makes it feel expensive.

## AI music: my recommendation

Use **ElevenLabs Music**, connected through Lovable's built-in ElevenLabs connector. Reasons:

- It is a first-class supported integration here, so no hand-rolled key handling and nothing brittle.
- It generates full instrumental and vocal tracks from a plain-language prompt, which is exactly the control surface you described (genre, mood, tempo, voice character, instrumentation).
- One API, one code path, no vendor sprawl.

How your controls map: we do not expose raw sliders to the model. Your choices (genre, vocal gender/character, tempo, bass/treble, mood) are compiled into a single well-formed prompt by a small AI Gateway call, then sent to the music model. That gives far better results than pasting slider values, and it is what makes the feature feel like magic rather than a form.

To keep resource use tiny: 30-second default length, one generation at a time per event, results cached in storage forever so a track is never regenerated, and looping/crossfade means one 30-second bed can score a 100-photo wall.

## Positioning and revenue

- Included with **Atelier**, as you chose. The Soundtrack section appears for Atelier events; other tiers see a preview card with a sample AI track and an upgrade link.
- Hard cap per event so a single host cannot run up cost: 3 AI songs, 6 uploaded tracks, 5 minutes / 10MB per uploaded file.
- If you later want per-song revenue, the credit ledger already exists (`ai_package_entitlements` / add-on pattern), so a "extra song" pack is a small follow-on, not a rebuild.

## What you were missing, that I would add

- **A "regenerate" that keeps the good parts.** One tap re-rolls the song with the same settings, keeping the previous version until you accept the new one. Prevents the classic "I lost the good one" moment.
- **Duck the music when a voice note plays.** You already have voice notes; music volume drops automatically instead of talking over them.
- **Per-device volume memory and muted-by-default start** (already the existing behaviour, kept). A wall must never start blaring on its own.
- **Licence attestation on uploads** (already exists) plus an explicit "AI-composed for this event" credit on AI tracks, giving you a clean takedown record either way.
- **Autoplay reality:** browsers block audio until someone clicks. TV mode gets one obvious "Start soundtrack" tap, then runs untouched all night.

## Technical notes

- Extend `event_wall_music` with: `source` (`upload` | `ai`), `prompt`, `settings` jsonb, `order_index`, `bpm`, `energy`, `intro_ms`, `outro_ms`, `crossfade_ms`, `link_url`, `link_provider`, `link_title`, `link_art_url`. Migration includes GRANTs and RLS policies for host-write / public-read, then re-verified after apply.
- New server functions in `src/lib/photo-wall.functions.ts` (or a sibling `wall-soundtrack.functions.ts`): `generateWallSong`, `addWallMusicLink`, `reorderWallMusic`, plus analysis persisted on insert. All entitlement-gated, rate-limited, and reading secrets inside `.handler()`.
- Prompt compilation uses `google/gemini-3.7-flash` through the existing gateway helper; music generation calls ElevenLabs Music with the connector-synced key and stores the MP3 in a private-read `event-music` bucket via service role. Gateway/provider errors are surfaced, never silently retried.
- Rewrite `src/components/wall-music-player.tsx` into a Web Audio graph: two buffered sources, scheduled crossfades from stored `crossfade_ms`, gap-free loop of the ordered list, ducking hook, and volume persistence. Slide advance in `wall.$eventId.index.tsx` subscribes to the audio clock so photos change on the bar.
- Link cards are render-only: parse and validate the URL host against an allow-list of the three services, store title/art from their public oEmbed/metadata, never proxy audio.
- Host UI: replace the current music block in `src/components/photo-wall-panel.tsx` with a Soundtrack section (upload, link, compose, reorder, preview, delete).

## Testing before I call it done

- Unit tests: prompt compilation, transition/crossfade maths, loop scheduling for fewer tracks than photos, link parsing/rejection of non-allow-listed hosts, entitlement and cap enforcement.
- One real ElevenLabs Music call executed and the resulting audio played back, per the rule that no AI feature ships on an untested call.
- Playwright on a self-created test event: upload two tracks, generate one AI track, open TV mode, confirm playback starts on the single tap, crossfades, loops past the end of the list, and photos advance on the beat. Screenshots at desktop and 375px.
- Migration policies and grants re-verified with a live query after apply.

## Safety

No real communications sent. No changes to `mrsmkendrick@gmail.com`'s event or Tenia's event. No payment maths, tier, or permission changes. Only self-created test data, deleted afterwards. Nothing published without your say-so.
