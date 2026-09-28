/**
 * Add music to a Group eCard: put one or more pieces from your Kenroe Sound
 * Studio library (songs, poems, letters) on the card, in the order they play
 * when it is revealed. Each piece must be paid for first; owners are exempt.
 * The rule is enforced on the server; this panel only explains it.
 */
import { toUserMessage } from "@/lib/user-error";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Music4 } from "lucide-react";
import {
  addPieceToEcard,
  getEcardPiecesPanel,
  moveEcardPiece,
  removePieceFromEcard,
} from "@/lib/ecard-pieces.functions";
import { PIECE_INELIGIBLE_MESSAGE } from "@/lib/ecard-pieces";
import { pieceKindLabel, songLengthLabel } from "@/lib/wall-soundtrack";
import { formatTimestamp } from "@/lib/datetime";

export function EcardMusicPanel({
  ecardId,
  onChanged,
}: {
  ecardId: string;
  onChanged: () => void;
}) {
  const load = useServerFn(getEcardPiecesPanel);
  const add = useServerFn(addPieceToEcard);
  const remove = useServerFn(removePieceFromEcard);
  const move = useServerFn(moveEcardPiece);
  const [busy, setBusy] = useState(false);
  const panel = useQuery({
    queryKey: ["ecard-pieces", ecardId],
    queryFn: () => load({ data: { ecardId } }),
  });
  const attached = panel.data?.attached ?? [];
  const library = panel.data?.library ?? [];
  const max = panel.data?.max ?? 10;
  const available = library.filter((p) => !p.onCard);
  const full = attached.length >= max;

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      await panel.refetch();
      onChanged();
      toast.success(success);
    } catch (e) {
      toast.error(toUserMessage(e, "Couldn't update the music."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-velvet/20 bg-paper p-5">
      <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
        <Music4 className="h-5 w-5 text-velvet" aria-hidden /> Add music, poems and letters
      </h2>
      <p className="mt-1.5 text-base leading-relaxed text-ink/70">
        Add as many songs, poems and letters read aloud as you like, up to {max}. They play in order
        the moment your card is opened, and the words of a poem or letter can be read instead. Each
        piece is paid for in Kenroe Sound Studio before it can go on a card. We tell you here when
        each one is heard.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to="/music"
          className="inline-flex min-h-14 items-center rounded-full border border-velvet/40 px-6 text-base font-medium text-velvet transition hover:bg-velvet/5"
        >
          Make a song or poem
        </Link>
        <Link
          to="/music"
          search={{ compose: "letter" } as never}
          className="inline-flex min-h-14 items-center rounded-full border border-velvet/40 px-6 text-base font-medium text-velvet transition hover:bg-velvet/5"
        >
          Write a letter for this card
        </Link>
      </div>

      {panel.isLoading ? (
        <p className="mt-4 text-sm text-ink/55">Loading your pieces…</p>
      ) : panel.isError ? (
        <p className="mt-4 text-sm text-destructive">
          {toUserMessage(panel.error, "Couldn't load your pieces.")}
        </p>
      ) : null}

      {attached.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium uppercase tracking-wide text-ink/55">
            On this card ({attached.length})
          </h3>
          <ol className="mt-2 space-y-3">
            {attached.map((p, i) => (
              <li key={p.id} className="rounded-2xl border border-velvet/25 bg-velvet/[0.05] p-4">
                <p className="font-medium text-ink">
                  {i + 1}. {p.title}{" "}
                  <span className="text-ink/55">
                    · {pieceKindLabel(p.kind)} · {songLengthLabel(p.seconds)}
                  </span>
                </p>
                {p.heardAt ? (
                  <p className="mt-1 text-sm font-medium text-velvet">
                    Heard on {formatTimestamp(p.heardAt)}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-ink/55">
                    We will tell you here the moment it is played.
                  </p>
                )}
                {p.url ? (
                  <audio src={p.url} controls preload="none" className="mt-3 w-full" />
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {attached.length > 1 && (
                    <>
                      <button
                        type="button"
                        disabled={busy || i === 0}
                        onClick={() =>
                          void run(
                            () => move({ data: { ecardId, pieceId: p.id, direction: "up" } }),
                            "Moved earlier",
                          )
                        }
                        className="inline-flex min-h-11 items-center rounded-full border border-ink/15 px-4 text-sm text-ink disabled:opacity-40"
                      >
                        Play earlier
                      </button>
                      <button
                        type="button"
                        disabled={busy || i === attached.length - 1}
                        onClick={() =>
                          void run(
                            () => move({ data: { ecardId, pieceId: p.id, direction: "down" } }),
                            "Moved later",
                          )
                        }
                        className="inline-flex min-h-11 items-center rounded-full border border-ink/15 px-4 text-sm text-ink disabled:opacity-40"
                      >
                        Play later
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => remove({ data: { ecardId, pieceId: p.id } }),
                        "Removed from the card",
                      )
                    }
                    className="inline-flex min-h-11 items-center rounded-full border border-velvet/40 px-4 text-sm font-medium text-velvet disabled:opacity-60"
                  >
                    Remove from card
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {available.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-medium uppercase tracking-wide text-ink/55">
            {attached.length ? "Add another" : "From your library"}
          </h3>
          <ul className="mt-2 space-y-3">
            {available.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 p-4"
              >
                <div>
                  <p className="font-medium text-ink">{p.title}</p>
                  <p className="text-sm text-ink/55">
                    {songLengthLabel(p.seconds)} · {pieceKindLabel(p.kind)}
                    {p.kind === "letter" || p.kind === "poem" ? " read aloud" : ""}
                  </p>
                  {!p.eligibility.ok && (
                    <p className="mt-1 text-sm text-ink/70">
                      {PIECE_INELIGIBLE_MESSAGE[p.eligibility.reason]}
                    </p>
                  )}
                </div>
                {p.eligibility.ok ? (
                  <button
                    type="button"
                    disabled={busy || full}
                    title={full ? `A card can hold up to ${max} pieces.` : undefined}
                    onClick={() =>
                      void run(() => add({ data: { ecardId, pieceId: p.id } }), "Added to the card")
                    }
                    className="inline-flex min-h-14 items-center rounded-full bg-velvet px-6 text-base font-medium text-paper transition hover:opacity-90 disabled:opacity-60"
                  >
                    Add to card
                  </button>
                ) : p.eligibility.reason === "unpaid" ? (
                  <Link
                    to="/music"
                    className="inline-flex min-h-14 items-center rounded-full border border-velvet/40 px-6 text-base font-medium text-velvet"
                  >
                    Pay in the studio
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : !panel.isLoading && library.length === 0 ? (
        <p className="mt-4 text-base leading-relaxed text-ink/70">
          You do not have a piece yet.{" "}
          <Link to="/music" className="underline decoration-velvet/40 underline-offset-4">
            Make one in Kenroe Sound Studio
          </Link>
          , then come back and add it here.
        </p>
      ) : null}
    </section>
  );
}
