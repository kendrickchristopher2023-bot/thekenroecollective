# Plan: 60-second AI soundtrack songs

## Goal
New AI-composed soundtrack songs are 60 seconds long instead of ~30 (the "29 seconds" seen today is the 30s song minus silence trimming).

## Change
- In `src/lib/wall-soundtrack.ts`, change `AI_SONG_SECONDS` from `30` to `60`.

That single constant is the default length used by:
- `composeWallSong` (new AI songs) in `src/lib/photo-wall.functions.ts`
- `regenerateWallMusic` (regenerating an existing AI song)

No other code change is needed: the host-facing length input already allows 10–120 seconds, and the panel displays the actual duration dynamically (mm:ss), so no hardcoded copy mentions 30.

## Verify
- Run the unit test suite; the two `seconds: 30` references in `tests/unit/wall-soundtrack-panel.test.tsx` are fixture data for display, not the default, but confirm they still pass and update if any assertion depends on the default.
- Confirm a freshly composed song reports ~60s duration in the panel.

## Note
60s songs cost roughly double the per-song music-generation credits; the per-event/per-IP rate limits stay unchanged.
