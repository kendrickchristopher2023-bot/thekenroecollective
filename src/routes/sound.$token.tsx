/**
 * The listen page for one Kenroe Sound Studio piece, opened by its private
 * link. Anyone with the link can play it; nothing else about the account or
 * the buyer is exposed.
 *
 * The piece is read in the loader so the title, the occasion and the artwork
 * are in the server-rendered HTML. Messaging apps and chat clients only read
 * the first response, so a preview card showing the song's name depends on
 * this being a loader rather than a browser fetch.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Music4 } from "lucide-react";
import { getSharedPiece } from "@/lib/music-studio.functions";
import { getSharedPieceDownloadUrl } from "@/lib/sound-playlists.functions";
import { songLengthLabel } from "@/lib/wall-soundtrack";
import { SHARE_COVER_URL } from "@/lib/sound-share";
import { toast } from "sonner";

type Piece = {
  id: string;
  kind: string;
  title: string;
  seconds: number;
  licence: string;
  hostName: string | null;
  eventTitle: string | null;
  words: string | null;
  url: string | null;
};

/** What to call each kind, in the guest's language rather than ours. */
function kindLabel(kind: string): string {
  return kind === "poem" ? "Spoken word" : kind === "letter" ? "A letter, read aloud" : "Song";
}

export const Route = createFileRoute("/sound/$token")({
  loader: async ({ params }) => {
    const res = (await getSharedPiece({ data: { token: params.token } } as never)) as {
      piece: Piece | null;
    };
    return { piece: res.piece };
  },
  head: ({ loaderData }) => {
    const piece = loaderData?.piece ?? null;
    const kind =
      piece?.kind === "poem"
        ? "A spoken word piece"
        : piece?.kind === "letter"
          ? "A letter read aloud"
          : "A song";
    const title = piece ? piece.title : "A piece from Kenroe Sound Studio";
    const forWhom = piece?.eventTitle
      ? ` for ${piece.eventTitle}`
      : piece?.hostName
        ? ` from ${piece.hostName}`
        : "";
    const description = piece
      ? `${kind}${forWhom}, made for one occasion by Kenroe Sound Studio. ${songLengthLabel(piece.seconds)}.`
      : "Listen to an original song or spoken-word piece made for one occasion by Kenroe Sound Studio.";
    return {
      meta: [
        { title: `${title} | Kenroe Sound Studio` },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "music.song" },
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
      <h1 className="font-serif text-2xl">This piece could not be loaded</h1>
      <p className="mt-2 text-sm text-ink/65">Please try the link again in a moment.</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen bg-paper px-6 py-20 text-center font-sans text-ink">
      <h1 className="font-serif text-2xl">This link is no longer live</h1>
    </div>
  ),
  component: SharedPiecePage,
});

function SharedPiecePage() {
  const { token } = Route.useParams();
  const { piece: row } = Route.useLoaderData();

  async function download() {
    try {
      const res = (await getSharedPieceDownloadUrl({ data: { key: token } } as never)) as {
        url: string | null;
        fileName: string | null;
      };
      if (!res.url) {
        toast.error("That download isn't available.");
        return;
      }
      const a = document.createElement("a");
      a.href = res.url;
      a.download = res.fileName ?? "Kenroe Sound Studio piece.mp3";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.error("Couldn't start that download.");
    }
  }

  return (
    <div className="min-h-screen bg-paper font-sans text-ink">
      <main className="mx-auto max-w-2xl px-6 py-16">
        <Link to="/music" className="text-xs font-medium uppercase tracking-[0.28em] text-blossom">
          Kenroe Sound Studio
        </Link>

        {!row ? (
          <div className="mt-10 rounded-3xl border border-ink/10 bg-white/70 p-6">
            <h1 className="font-serif text-2xl text-ink">This link is no longer live</h1>
            <p className="mt-2 text-sm text-ink/65">
              The piece may have been removed. Ask whoever shared it for a new link.
            </p>
          </div>
        ) : (
          <div className="mt-10 rounded-3xl border border-blossom/25 bg-white/70 p-6 sm:p-8">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-blossom">
              <Music4 className="h-3.5 w-3.5" aria-hidden />
              {kindLabel(row.kind)}
            </p>
            <h1 className="mt-2 font-serif text-3xl text-ink">{row.title}</h1>
            <p className="mt-1 text-sm text-ink/60">
              {songLengthLabel(row.seconds)}
              {row.eventTitle ? ` · for ${row.eventTitle}` : row.hostName ? ` · from ${row.hostName}` : ""}
            </p>
            {row.url ? (
              <audio src={row.url} controls autoPlay={false} className="mt-5 w-full" />
            ) : (
              <p className="mt-5 text-sm text-ink/60">The audio could not be loaded.</p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              {row.url ? (
                <button
                  type="button"
                  onClick={() => void download()}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-sm text-ink/70 ring-1 ring-ink/15 hover:bg-ink/5"
                >
                  <Download className="h-4 w-4" aria-hidden /> Download
                </button>
              ) : null}
              <Link
                to="/music"
                className="inline-flex min-h-[44px] items-center rounded-full bg-blossom px-6 text-sm font-medium text-white hover:opacity-90"
              >
                Make one of your own
              </Link>
            </div>
            {row.words ? (
              <section className="mt-8 border-t border-ink/10 pt-6">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/50">
                  {row.kind === "song" ? "The words" : "Read it instead"}
                </h2>
                <p className="mt-3 whitespace-pre-line font-serif text-[15px] leading-relaxed text-ink/85">
                  {row.words}
                </p>
              </section>
            ) : null}

            <p className="mt-5 text-xs text-ink/45">{row.licence}</p>
          </div>
        )}
      </main>
    </div>
  );
}
