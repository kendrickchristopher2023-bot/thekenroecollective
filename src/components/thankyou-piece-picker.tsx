/**
 * Attach a letter, poem, or song from Atelier Studio to a thank-you card.
 *
 * The card itself only ever carries a link. Guests open a hosted page that
 * plays the piece and always prints the written words underneath, so a guest
 * with the sound off, on a train, or using a screen reader receives the same
 * thing as a guest who presses play.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Music4, X } from "lucide-react";
import { listMyPieces } from "@/lib/music-studio.functions";
import { pieceShareUrl } from "@/lib/sound-share";
import { songLengthLabel } from "@/lib/wall-soundtrack";

export type AttachedPiece = {
  url: string;
  title: string;
  kind: string;
};

type Row = {
  id: string;
  kind: string;
  title: string;
  seconds: number;
  shareToken: string;
  shareKey?: string | null;
};

const KIND_LABEL: Record<string, string> = {
  letter: "Letter",
  poem: "Poem",
  song: "Song",
};

export function ThankYouPiecePicker({
  value,
  onChange,
}: {
  value?: AttachedPiece;
  onChange: (next: AttachedPiece | undefined) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["thankyou-pieces"],
    queryFn: async () => {
      const res = (await listMyPieces({ data: {} } as never)) as { pieces?: Row[] } | Row[];
      const rows = Array.isArray(res) ? res : (res.pieces ?? []);
      return rows.filter((r) => ["letter", "poem", "song"].includes(r.kind));
    },
    staleTime: 60_000,
  });

  if (value) {
    return (
      <div className="rounded-xl bg-secondary p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              <Music4 className="h-4 w-4 text-velvet" aria-hidden />
              {value.title}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {KIND_LABEL[value.kind] ?? "Piece"} · guests get a page that plays it and prints the
              words
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-full px-3 text-xs text-muted-foreground hover:bg-ink/5"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Remove
          </button>
        </div>
        <a
          href={value.url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-[11px] font-medium text-velvet underline"
        >
          Open the page guests will see
        </a>
      </div>
    );
  }

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Looking for your pieces...</p>;
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nothing to attach yet.{" "}
        <Link to="/music" className="font-medium text-velvet underline">
          Write a letter, a poem, or a song
        </Link>{" "}
        and it will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.slice(0, 12).map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() =>
            onChange({
              url: pieceShareUrl(window.location.origin, r.shareKey || r.shareToken),
              title: r.title,
              kind: r.kind,
            })
          }
          className="flex w-full items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2 text-left hover:bg-ink/5"
        >
          <span className="text-sm">{r.title}</span>
          <span className="text-[11px] text-muted-foreground">
            {KIND_LABEL[r.kind] ?? r.kind} · {songLengthLabel(r.seconds)}
          </span>
        </button>
      ))}
    </div>
  );
}
