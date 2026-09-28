# Printable invitations that fit, and a smoother slideshow soundtrack

Two things in one pass: fix the downloadable invitation PDF sizes (there is a real bug), and land the five soundtrack refinements.

## Part A — Downloadable invitation size bug

I generated all six invitation sizes from a copy of Tenia's event and rendered every page to an image. Findings:

- US Letter, A4, 5x7, Half-Letter: correct page dimensions, content centred, nothing clipped.
- **5 x 5" square: the QR code and "Scan to RSVP" run off the bottom of the page** and through the gold border. That matches your first screenshot.
- **4 x 6" postcard: the QR block sits right on the border** with almost no breathing room, so home printers with any margin will shave it.

Cause: the layout measures its own height, then centres it, but never shrinks anything when the content is taller than the page. Small formats always overflow.

Fix:

1. After measuring, if the block is taller than the printable area, scale the whole layout down (type sizes, gaps, QR size) by a single factor until it fits, with a sensible floor so text never becomes unreadable.
2. If it still cannot fit at the floor (a very long message on a 4x6), trim the quoted message by a line or two rather than clip the QR, since the QR is the functional part.
3. Keep the block vertically centred, and guarantee a minimum clear gap between the QR caption and the gold border on every size.

Verification: regenerate all six sizes, render each page to an image, and confirm no element crosses the border and the QR still scans at print size.

Your second screenshot is a browser PDF viewer zoomed in, not a layout fault, so nothing to fix there.

## Part B — Soundtrack refinements

1. **Trim leading and trailing silence.** During analysis, find the first and last point where the waveform crosses a low threshold and store those as the track's playable head and tail. Playback then starts and ends there, so no crossfade has to hide dead air. The head and tail figures use the two unused columns already on the music table, so no schema change.
2. **Loudness match.** Turn each track's measured energy into a per-track gain so a loud AI song and a quiet upload sit at the same perceived level. Applied at playback, clamped so nothing is boosted into distortion, and never above the master volume the host set.
3. **Beat-aligned entry.** When the tempo estimate is confident, the incoming track starts on its first strong onset (the trimmed head) rather than sample zero, and the overlap continues to land on whole bars. When the tempo reading is weak, it falls back to today's behaviour instead of guessing. Confidence is recorded alongside the existing track settings.
4. **"No crossfade" per event.** A host toggle on the soundtrack panel. With it on, tracks play end to end with a short clean gap, no overlap, ideal for a ceremony. Stored on the event, default off, so nothing changes for existing events.
5. **Graceful ending.** When the wall is closed, the slideshow ends, or Stop is pressed, the music fades down over the final stretch (up to 20 seconds, shorter if the track has less left) instead of cutting. Pause stays instant, since that is what Pause should be.

## Technical notes

- `src/lib/audio-analyze.ts`: return `introMs`, `outroMs`, `bpmConfidence`, and a normalisation gain alongside the existing seconds/bpm/energy.
- `src/lib/wall-soundtrack.ts`: add pure helpers for trim-aware duration, per-track gain, downbeat entry offset, and a no-crossfade transition plan. Unit-tested.
- `src/components/wall-music-player.tsx`: schedule with head/tail offsets and per-track gain, honour the no-crossfade mode, and add the timed master fade on stop/close/slideshow end.
- `src/components/wall-soundtrack-panel.tsx`: the per-event crossfade toggle, still owner-only like the rest of the soundtrack feature.
- `src/lib/invite-pdf-export.ts`: single scale factor threaded through the existing measure-then-draw pass.
- No database schema change, no payment, tier, or permission change, nothing sent, nothing published. Verification is unit tests plus a phone-width browser run of the wall and rendered PDF images for all six sizes.
