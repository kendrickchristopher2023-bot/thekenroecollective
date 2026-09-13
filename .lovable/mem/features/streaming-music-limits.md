---
name: Streaming music limits (Spotify / Apple / Amazon)
description: Streaming links may only render each service's official embedded player; never sync, mix, proxy or beat-match their audio, and never build MusicKit soundtracking
type: constraint
---
Spotify, Apple Music and Amazon Music audio must never be synchronised to the
Photo Wall slideshow, mixed with our own tracks, crossfaded, beat-matched,
proxied, downloaded or timed to photo advance.

Apple's Developer Program License Agreement MusicKit clause states MusicKit
Content "cannot be synchronized with any other content", content may be played
"only as rendered by the MusicKit APIs or MusicKit JS", the listener must start
and control playback, and developers may not "indirectly monetize access to the
Apple Music service". A paid tier that soundtracks a slideshow with Apple Music
violates that on two counts, so MusicKit JS soundtracking is off the table and
no Apple Developer membership is needed for it. Spotify's terms forbid the same
sync use.

What IS allowed and is what we ship: each service's own public embedded player
(`embed.music.apple.com`, `open.spotify.com/embed/...`,
`music.amazon.com/embed/<id>`), inside an iframe, started by a person. Non
subscribers hear 30 second previews. Helper: `musicEmbed()` in
`src/lib/wall-soundtrack.ts` with a strict three-host allow-list; never frame an
arbitrary host. Starting a streaming player stops our own Web Audio soundtrack
(one source at a time), and the UI must say plainly that it is a separate
player, not the soundtrack.
