/**
 * Turns a pasted Apple Music or Spotify link into an embeddable player URL.
 *
 * A bare link only sends guests out to another app, so the invitation embeds
 * the official player instead. Only these two hosts are ever embedded: an
 * iframe pointed at arbitrary host input would let a host frame anything.
 */

export type PlaylistEmbed = {
  /** Absolute src for the iframe. */
  src: string;
  provider: "apple" | "spotify";
  /** Suggested iframe height in px. */
  height: number;
  /** Honest note about what guests will actually hear. */
  note: string;
};

/** Adds a scheme when the host typed a bare domain, and parses safely. */
export function parsePlaylistUrl(raw?: string | null): URL | null {
  const value = (raw || "").trim();
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value)
    ? value
    : `https://${value.replace(/^\/+/, "")}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

/** Normalised outbound link, used for the fallback "Listen" button. */
export function playlistLink(raw?: string | null): string | null {
  return parsePlaylistUrl(raw)?.toString() ?? null;
}

export function playlistEmbed(raw?: string | null): PlaylistEmbed | null {
  const url = parsePlaylistUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "music.apple.com" || host === "embed.music.apple.com") {
    const embed = new URL(url.toString());
    embed.hostname = "embed.music.apple.com";
    return {
      src: embed.toString(),
      provider: "apple",
      height: 450,
      note: "Apple Music plays a 30 second preview of each song unless the listener is signed in to Apple Music.",
    };
  }

  if (host === "open.spotify.com") {
    // /playlist/ID -> /embed/playlist/ID (already-embedded links pass through).
    const path = url.pathname.startsWith("/embed/")
      ? url.pathname
      : `/embed${url.pathname}`;
    return {
      src: `https://open.spotify.com${path}`,
      provider: "spotify",
      height: 380,
      note: "Spotify plays 30 second previews unless the listener is signed in to Spotify.",
    };
  }

  return null;
}
