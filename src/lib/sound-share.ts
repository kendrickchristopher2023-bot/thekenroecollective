/**
 * Share links and link previews for Kenroe Sound Studio.
 *
 * Readable, but not guessable. A pure slug like /sound/kendrick-family-bonfire
 * could be enumerated by anyone who knows a family name, and briefs and titles
 * carry real names, so every share address is a readable slug plus a random
 * suffix generated in the database: ten characters from a 31 symbol alphabet
 * (digits 2-9 and lowercase letters, look-alikes removed) is about 49.5 bits,
 * roughly 8 x 10^14 possibilities. Guessing one specific piece is hopeless, and
 * sweeping for any valid link at even 1,000 attempts a second would take on the
 * order of 25,000 years to cover a single percent of the space.
 */

/** Artwork used on the link preview card in messages and chat apps. */
export const SHARE_COVER_URL = "https://thekenroecollective.com/sound-share-cover.jpg";

export function pieceShareUrl(origin: string, key: string): string {
  return `${origin}/sound/${key}`;
}

export function playlistShareUrl(origin: string, key: string): string {
  return `${origin}/playlist/${key}`;
}

/** Playlist audio as a zip, named from the playlist. */
export function playlistZipUrl(origin: string, key: string): string {
  return `${origin}/api/public/playlist-zip/${key}`;
}
