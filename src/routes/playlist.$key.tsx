/**
 * A shared playlist, opened by its private link.
 *
 * Private by default: there is no directory, no listing and no search. The
 * link is the credential. What comes back is deliberately thin: track titles,
 * their order, their length and playable audio. No brief, no words, no
 * settings, no owner id, no event id.
 *
 * Playback reuses the Photo Wall player, so the crossfades, silence trimming
 * and loudness matching that were tuned there apply here too. There is no
 * second player.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, ListMusic } from "lucide-react";
import { getSharedPlaylist } from "@/lib/sound-playlists.functions";
import { WallMusicPlayer } from "@/components/wall-music-player";
import { songLengthLabel } from "@/lib/wall-soundtrack";
import { SHARE_COVER_URL, playlistZipUrl } from "@/lib/sound-share";

type Shared = {
  name: string;
  description: string | null;
  hostName: string | null;
  tracks: Array<{
    id: string;
    title: string;
    kind: string;
    seconds: number;
    bpm: number | null;
    energy: number | null;
    position: number;
    url: string | null;
  }>;
};

export const Route = createFileRoute("/playlist/$key")({
  loader: async ({ params }) => {
    const res = (await getSharedPlaylist({ data: { key: params.key } } as never)) as {
      playlist: Shared | null;
    };
    return { playlist: res.playlist };
  },
  head: ({ loaderData }) => {
    const pl = loaderData?.playlist ?? null;
    const title = pl ? pl.name : "A playlist from Kenroe Sound Studio";
    const count = pl?.tracks.length ?? 0;
    const description = pl
      ? `${count} ${count === 1 ? "piece" : "pieces"}${pl.hostName ? ` from ${pl.hostName}` : ""}, made for one occasion by Kenroe Sound Studio.`
      : "Listen to a collection of original pieces made for one occasion by Kenroe Sound Studio.";
    return {
      meta: [
        { title: `${title} | Kenroe Sound Studio` },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "music.playlist" },
        { property: "og:image", content: SHARE_COVER_URL },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: SHARE_COVER_URL },
      ],
    };
  },
  errorComponent: () => (
    <div className="min-h-screen bg-paper px-6 py-20 text-center font-sans text-ink">
      <h1 className="font-serif text-2xl">This playlist could not be loaded</h1>
      <p className="mt-2 text-sm text-ink/65">Please try the link again in a moment.</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen bg-paper px-6 py-20 text-center font-sans text-ink">
      <h1 className="font-serif text-2xl">This link is no longer live</h1>
    </div>
  ),
  component: SharedPlaylistPage,
});

function SharedPlaylistPage() {
  const { key } = Route.useParams();
  const { playlist } = Route.useLoaderData();

  const tracks = (playlist?.tracks ?? [])
    .filter((t) => t.url)
    .map((t) => ({
      id: t.id,
      title: t.title,
      artist: null,
      url: t.url as string,
      crossfadeMs: 2500,
      bpm: t.bpm,
      energy: t.energy,
    }));

  return (
    <div className="min-h-screen bg-paper font-sans text-ink">
      <main className="mx-auto max-w-2xl px-6 py-16">
        <Link to="/music" className="text-xs font-medium uppercase tracking-[0.28em] text-blossom">
          Kenroe Sound Studio
        </Link>

        {!playlist ? (
          <div className="mt-10 rounded-3xl border border-ink/10 bg-white/70 p-6">
            <h1 className="font-serif text-2xl text-ink">This link is no longer live</h1>
            <p className="mt-2 text-sm text-ink/65">
              Ask whoever shared it with you for a new link.
            </p>
          </div>
        ) : (
          <div className="mt-10 rounded-3xl border border-blossom/25 bg-white/70 p-6 sm:p-8">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-blossom">
              <ListMusic className="h-3.5 w-3.5" aria-hidden /> Playlist
            </p>
            <h1 className="mt-2 font-serif text-3xl text-ink">{playlist.name}</h1>
            <p className="mt-1 text-sm text-ink/60">
              {playlist.tracks.length} {playlist.tracks.length === 1 ? "piece" : "pieces"}
              {playlist.hostName ? ` · from ${playlist.hostName}` : ""}
            </p>
            {playlist.description ? (
              <p className="mt-3 text-sm text-ink/70">{playlist.description}</p>
            ) : null}

            {tracks.length ? (
              <div className="mt-5">
                <WallMusicPlayer tracks={tracks} compact />
              </div>
            ) : (
              <p className="mt-5 text-sm text-ink/60">
                There is nothing in this playlist to play just now.
              </p>
            )}

            <ol className="mt-6 space-y-3">
              {playlist.tracks.map((t, i) => (
                <li key={t.id} className="rounded-2xl border border-ink/10 bg-white/70 p-4">
                  <p className="font-medium text-ink">
                    <span className="text-ink/40">{i + 1}.</span> {t.title}{" "}
                    <span className="text-ink/50">
                      · {songLengthLabel(t.seconds)} · {t.kind === "poem" ? "Spoken word" : "Song"}
                    </span>
                  </p>
                  {t.url ? (
                    <audio src={t.url} controls preload="none" className="mt-3 w-full" />
                  ) : null}
                </li>
              ))}
            </ol>

            {playlist.tracks.length ? (
              <a
                href={playlistZipUrl("", key)}
                className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-sm text-ink/70 ring-1 ring-ink/15 hover:bg-ink/5"
              >
                <Download className="h-4 w-4" aria-hidden /> Download all
              </a>
            ) : null}

            <div className="mt-6">
              <Link
                to="/music"
                className="inline-flex min-h-[44px] items-center rounded-full bg-blossom px-6 text-sm font-medium text-white hover:opacity-90"
              >
                Make one of your own
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
