Song preview before committing to the full 60 seconds

Today, composing a song goes straight to a full 60-second track: it costs a full generation, saves a file, and adds a track to the wall list. There is no way to hear whether the style, mood, or the pronunciation of names is right first.

## What you'll get

**1. "Hear a 10-second sample" button**

Next to the compose button in the Photo Wall Soundtrack panel. It:

- Composes a short 10-second taste using the exact same settings and the same polished musical direction the full song would use.
- Plays back inline with a small player (play/pause, replay). Nothing is added to your track list, nothing is stored in the cloud, nothing is attached to an invitation.
- Shows the musical direction text that was used, so you can see what the composer was told. 

**2. Names and pronunciation check**

The sample is generated from the same words you typed, so if a name comes out wrong you can adjust the spelling (for example "Kenroe" written as "Ken-row") and take another sample. A short hint under the words field explains this trick.

**3. "Compose the full song from this sample"**

After a sample you like, the full 60-second version is composed using the same locked-in musical direction, so the full song matches what you heard instead of drifting into a different arrangement.

**4. Cost and waste guardrails**

- Samples are limited per event (a small hourly allowance) so nobody can burn through generations by tapping repeatedly.
- The sample button is disabled while a sample or full song is in flight, so you can't double-charge with a double tap.
- A clear one-line note: samples are short and cheap; the full song is the paid-scale step.

**5. Upload and long-song safety (60 seconds and beyond)**

- A 60-second song is roughly 1MB, well inside the existing 10MB / 5-minute limits, so nothing breaks.
- The compose and sample flows already stay on the page. I'll confirm no navigation, refresh, or lost form state happens during a long generation, and add a visible "composing, this can take up to a minute" state with the panel staying usable.
- Upload gets a friendly progress state and clearer errors (file too long, wrong format, too large) instead of a silent wait.

## Also recommended (included)

- **Keep the sample settings**: if you close and reopen the panel, your last words/genre/mood/voice choices come back, so you never retype before sampling again.
- **Name the song at compose time**: the title and artist fields already exist; the sample screen will show the name you'll get, so the invitation card is right the first time.
- **Retake counter**: shows how many samples you've taken for this event, so it's obvious when you're circling.

## Technical notes

- New server function `sampleWallSong` in `src/lib/photo-wall.functions.ts`: same auth (`requireSupabaseAuth`, `assertCanEdit`, `assertSoundtrackAccess`, `assertPhotoWall`) and same `compileSongPrompt` + `polishSongPrompt` path, `music_length_ms` of 10000, returns `{ audioBase64, contentType, prompt }`. No storage upload, no `event_wall_music` row, so `assertRoom` caps are untouched.
- Rate limit: count sample calls per event/user in a lightweight in-handler check against `event_activity_log` (or a small counter table) to cap samples per hour; error message is plain-language.
- `generateWallSong` gains an optional `prompt` passthrough (validated, length-capped) so "compose from this sample" reuses the sample's exact direction instead of re-polishing. When absent, behaviour is unchanged.
- Panel (`src/components/wall-soundtrack-panel.tsx`): sample state (`audio` object URL from a base64 blob), inline `<audio controls>`, cleanup of the object URL on unmount/new sample, buttons disabled while `composing || sampling`. Draft settings persisted to `localStorage` per event.
- No AbortSignal timeouts on the generation fetch; awaited fully per the gateway/provider timeout rules.
- Tests: unit coverage for prompt passthrough, sample length clamp, rate-limit rejection, and a panel test that a sample does not add a track row.
- No publishing, and the sample flow never touches invitation fields.