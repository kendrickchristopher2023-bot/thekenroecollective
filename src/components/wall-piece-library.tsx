/**
 * Put a saved Sound Studio piece on this event's Photo Wall.
 *
 * The studio is where a song, a poem or a letter is made and paid for once. This
 * panel is only the placing step, so nothing is charged here and no piece is
 * duplicated in the studio library. A letter always lands as a moment played
 * once; a poem can be either; a song is always the bed under the photos. That
 * rule lives in `placementFor`, shared with the server, so the two can never
 * disagree.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { listMyPieces } from "@/lib/music-studio.functions";
import { attachPieceToWall } from "@/lib/photo-wall.functions";
import { toUserMessage } from "@/lib/user-error";
import {
  pieceKindLabel,
  placementFor,
  placementLabel,
  songLengthLabel,
} from "@/lib/wall-soundtrack";

type Piece = { id: string; kind: string; title: string; seconds: number; url: string | null };

export function WallPieceLibrary({
  eventId,
  kind,
  onAttached,
}: {
  eventId: string;
  /** Which kind this picker is for, so a host is not scrolling past the rest. */
  kind: "song" | "poem" | "letter";
  onAttached: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [asMoment, setAsMoment] = useState(kind === "letter");
  const library = useQuery({
    queryKey: ["studio-library"],
    queryFn: async () => (await listMyPieces()) as { pieces: Piece[] },
  });

  const pieces = (library.data?.pieces ?? []).filter((p) =>
    kind === "song" ? p.kind !== "poem" && p.kind !== "letter" : p.kind === kind,
  );
  const placement = placementFor(kind, asMoment ? "moment" : "bed");
  const label = pieceKindLabel(kind).toLowerCase();

  async function attach(pieceId: string) {
    setBusy(pieceId);
    try {
      await attachPieceToWall({ data: { eventId, pieceId, placement } } as never);
      onAttached();
      toast.success(
        placement === "moment"
          ? "Added. A play button for it now shows on the wall."
          : "Added to the soundtrack.",
      );
    } catch (e) {
      toast.error(toUserMessage(e, "Couldn't add that piece."));
    } finally {
      setBusy(null);
    }
  }

  if (library.isLoading) {
    return <p className="mt-2 text-[11px] text-muted-foreground">Looking in your library…</p>;
  }

  if (!pieces.length) {
    return (
      <p className="mt-2 text-[11px] text-muted-foreground">
        You have no saved {label} yet.{" "}
        <Link to="/music" className="underline underline-offset-2">
          Write one in Kenroe Sound Studio
        </Link>
        , then come back and place it here.
      </p>
    );
  }

  return (
    <div className="mt-2">
      {kind === "poem" && (
        <label className="flex items-start gap-2 rounded-lg bg-secondary px-2 py-1.5 text-[11px] text-ink/75">
          <input
            type="checkbox"
            checked={asMoment}
            onChange={(e) => setAsMoment(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Play this once, when someone presses play, instead of looping it under the photos.
            Choose this for the moment the room goes quiet.
          </span>
        </label>
      )}
      <p className="mt-1.5 text-[11px] text-muted-foreground">{placementLabel(placement)}.</p>
      <ul className="mt-2 space-y-1.5">
        {pieces.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-card px-2 py-1.5"
          >
            <span className="text-xs text-ink">
              {p.title}
              <span className="text-muted-foreground">
                {" "}
                · {songLengthLabel(Math.round(p.seconds))} · {pieceKindLabel(p.kind)}
              </span>
            </span>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void attach(p.id)}
              className="min-h-11 rounded-lg border border-ink/25 bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
            >
              {busy === p.id ? "Adding…" : "Put it on the wall"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
