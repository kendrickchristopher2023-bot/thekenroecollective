---
name: Kenroe Sound Studio (Venture 05)
description: Standalone music/spoken-word product at /music, coming-soon publicly, owner-only private preview with unlimited composes and downloads
type: feature
---
Venture 05 "Kenroe Sound Studio" is a standalone paid product, listed under
Celebrations on the `/` ventures splash with status `coming_soon` and the
`blossom` (#b8576a rose) accent, which sits between velvet (Events) and walnut
(eCards). Row lives in the `ventures` table plus `FALLBACK_VENTURES`.

- Page: `src/routes/music.tsx`. Public visitors see the coming-soon teaser and
  an "Ask for early access" CTA to `/contact`.
- Server: `src/lib/music-studio.functions.ts` — `studioAccess`, `studioCompose`,
  `studioWrite`. Owner/super_admin only (Chris and Adrian), unlimited composes,
  no hourly allowance, no per-event cap. Nothing stored server-side: audio comes
  back base64, plays in the browser, downloads as MP3, and is kept on the local
  IndexedDB sample shelf under the reserved key `studio`.
- Lengths: 10/20/30 second auditions plus 1, 2, 3, 4 minute pieces.
- Third kind beside Song and Poem: Letter. `src/components/studio-letter-panel.tsx`
  + `src/lib/studio-letters.functions.ts` (`letterWrite` free, `letterCompose` paid)
  + `src/lib/studio-letter.ts` (110 words/minute, paces, fixed voice list).
  Two hard rules: no voice cloning ever (voice id looked up in `LETTER_VOICES`),
  and no invented facts (returned text checked against the writer's own material,
  flagged names/dates must be confirmed before anything is read aloud).
  ElevenLabs needs Text to Speech access, not music generation only.

- Prompts reuse `compileSongPrompt` / `compilePoemPrompt` from
  `src/lib/wall-soundtrack.ts`, so studio and Photo Wall soundtrack stay in step.
- Do not price or advertise it publicly until it leaves private preview.
- Every control is a constraint, not a hint: `src/lib/studio-constraints.ts`
  re-asserts the host's choices AFTER the AI producer pass, pushes them onto the
  composition plan as positive/negative styles, and verifies the plan before any
  paid render. A plan that contradicts a control blocks the paid compose until
  the host rewrites for free or presses "compose anyway". Instrumental always
  takes the prompt path with `force_instrumental`, never a plan.
