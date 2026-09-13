---
name: Photo Wall soundtrack access
description: Soundtrack (uploads, playlist cards, AI songs) is internal owner-only, not a customer add-on; one switch to re-open it later
type: constraint
---
The Photo Wall soundtrack (own-music uploads, Spotify/Apple/Amazon launch cards,
AI-composed songs) is NOT sold to customers. It is available only to the two
software owners, Chris and Adrian, because AI composing and hosted audio cost
money per use. Christopher may offer it as a service he performs himself.

The customer setup is preserved, not deleted. The single switch is
`SOUNDTRACK_AUDIENCE` in `src/lib/wall-soundtrack-access.ts`:
`"owners_only"` (current), `"atelier"`, or `"everyone"`. Both the host panel
(`photo-wall-panel.tsx`) and the server functions in `photo-wall.functions.ts`
(`assertSoundtrackAccess`) read that one value. Do not re-advertise the
soundtrack in pricing, FAQ, or add-on catalogues while it is `owners_only`.

Guest playback of an already-built soundtrack stays public, so an owner-built
soundtrack still plays on the wall for everyone at that event.
