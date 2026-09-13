/**
 * Add music to a Group eCard: attach a piece from your Kenroe Sound Studio
 * library so it plays when the card is revealed.
 */
import { toUserMessage } from "@/lib/user-error";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Music4 } from "lucide-react";
import { attachPieceToEcard, listMyPieces } from "@/lib/music-studio.functions";
import { pieceKindLabel, songLengthLabel } from "@/lib/wall-soundtrack";

type Piece = {
  id: string;
  kind: string;
  title: string;
  seconds: number;
  url: string | null;
};

export function EcardMusicPanel({
  ecardId,
  musicPieceId,
  musicHeardAt,
  onChanged,
}: {
  ecardId: string;
  musicPieceId: string | null;
  musicHeardAt?: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const library = useQuery({
    queryKey: ["studio-library"],
    queryFn: async () => (await listMyPieces()) as { pieces: Piece[] },
  });
  const pieces = library.data?.pieces ?? [];
  const attached = pieces.find((p) => p.id === musicPieceId) ?? null;

  async function attach(pieceId: string | null) {
    setBusy(true);
    try {
      await attachPieceToEcard({ data: { ecardId, pieceId } } as never);
      onChanged();
      toast.success(pieceId ? "Music added to this card" : "Music removed");
    } catch (e) {
      toast.error(toUserMessage(e, "Couldn't update the music."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-velvet/20 bg-paper p-5">
      <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
        <Music4 className="h-5 w-5 text-velvet" aria-hidden /> Add music
      </h2>
      <p className="mt-1.5 text-base leading-relaxed text-ink/70">
        Play an original song, a poem or a letter read aloud the moment your card is opened. A
        song plays as background. A poem or a letter is listened to, so it plays through once,
        and the words can be read instead. We tell you here when it is heard.
      </p>
      <Link
        to="/music"
        search={{ compose: "letter" } as never}
        className="mt-3 inline-flex min-h-14 items-center rounded-full border border-velvet/40 px-6 text-base font-medium text-velvet transition hover:bg-velvet/5"
      >
        Write a letter for this card
      </Link>


      {attached ? (
        <div className="mt-4 rounded-2xl border border-velvet/25 bg-velvet/[0.05] p-4">
          <p className="font-medium text-ink">
            {attached.title}{" "}
            <span className="text-ink/55">{pieceKindLabel(attached.kind)} ·</span>{" "}
            <span className="text-ink/55">· {songLengthLabel(attached.seconds)}</span>
          </p>
          {musicHeardAt ? (
            <p className="mt-2 text-sm font-medium text-velvet">
              Heard on{" "}
              {new Date(musicHeardAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink/55">
              We will tell you here the moment it is played.
            </p>
          )}
          {attached.url ? (
            <audio src={attached.url} controls preload="none" className="mt-3 w-full" />
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void attach(null)}
            className="mt-3 inline-flex min-h-14 items-center rounded-full border border-velvet/40 px-6 text-base font-medium text-velvet transition hover:bg-velvet/5 disabled:opacity-60"
          >
            Remove music
          </button>
        </div>
      ) : pieces.length ? (
        <ul className="mt-4 space-y-3">
          {pieces.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 p-4"
            >
              <div>
                <p className="font-medium text-ink">{p.title}</p>
                <p className="text-sm text-ink/55">
                  {songLengthLabel(p.seconds)} · {pieceKindLabel(p.kind)}
                  {p.kind === "letter" || p.kind === "poem" ? " read aloud, plays once" : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void attach(p.id)}
                className="inline-flex min-h-14 items-center rounded-full bg-velvet px-6 text-base font-medium text-paper transition hover:opacity-90 disabled:opacity-60"
              >
                Use this one
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-base leading-relaxed text-ink/70">
          You do not have a piece yet.{" "}
          <Link to="/music" className="underline decoration-velvet/40 underline-offset-4">
            Make one in Kenroe Sound Studio
          </Link>
          , then come back and add it here.
        </p>
      )}
    </section>
  );
}
