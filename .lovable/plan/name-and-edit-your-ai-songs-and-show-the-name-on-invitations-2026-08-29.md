# Name and edit your AI songs, and show the name on invitations

Right now an AI-composed song gets an automatic name like "Warm Acoustic (AI)" and there is no way to change it. There is also no one-click way to move a song you composed onto an invitation, so the name a guest sees is whatever the file happened to be called.

## What changes

1. **Name it while you compose.** The compose form gets an optional "Song name" field. Leave it blank and the current auto-name is used, so nothing breaks for songs already made.

2. **Rename any track later.** Every row in the Soundtrack list (AI songs, your uploads, playlist cards) gets a pencil/edit control that turns the title into an editable field. Saving updates the name everywhere it appears: the soundtrack list, the Photo Wall now-playing label, and any invitation using it.

3. **Use on the invitation, with the name.** Each AI song and upload gets a "Use on invitation" action that sets the invitation song to that track and carries the name and artist across. Guests then see the real song name on the invitation card instead of a filename.

4. **Fix the name not sticking.** On the invitation song field, a name typed before the upload finishes can get overwritten by the filename. The upload will stop clobbering a name the host already typed.

5. **Guest side.** The invitation song card already shows the title; it will show the edited name, fall back to the artist line when set, and the download filename will follow the name rather than defaulting to song.mp3.

Owner-only access to the soundtrack feature is unchanged (Chris and Adrian), and guest playback of an already-attached song stays public.

## Also recommended (say if you want these in this pass)

- **Artist / credit line on AI songs** so an invitation can read "Composed for Tenia's Birthday". Small addition.
- **Regenerate keeping the name**: recompose with the same name and settings when a take is not quite right.
- **Reuse a song across events**: pick a song you already composed instead of composing again, which also saves generation cost.
- **Length label on AI songs** in the list so you can see at a glance whether a track is 30 seconds or 3 minutes.

## Technical notes

- New `renameWallMusic` server function in `src/lib/photo-wall.functions.ts`, guarded by the same owner check and event-ownership check as the other four write operations, updating `event_wall_music.title` (and `link_title` for playlist rows).
- `generateWallSong` gains an optional `title` input, validated to 120 chars, used in place of the derived `${mood} ${genre} (AI)` label.
- `src/components/wall-soundtrack-panel.tsx`: inline rename UI plus a "Use on invitation" button that writes `songUrl`, `songTitle`, `songArtist` through the existing `updateEvent` store call.
- `SongField` in `src/routes/events.$eventId.index.tsx`: only fall back to the filename when no title has been typed.
- Tests: extend `tests/unit/wall-soundtrack-panel.test.tsx` for rename and attach-to-invitation, plus a rename access test alongside `tests/unit/wall-soundtrack-access.test.ts`.
- Verify in the browser at phone width that a renamed song plays and downloads under its new name before reporting done. No sends, no publish, no changes to Tenia's event.
