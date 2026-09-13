/**
 * Swap the invitation song for one already saved in Kenroe Sound Studio.
 *
 * The invitation song is a plain public audio URL on the event, so a studio
 * piece is copied out of the private sound-pieces bucket into the same public
 * media storage every other invitation asset uses. Picking a different piece
 * simply overwrites the song fields, so hosts can switch songs as often as
 * they like without uploading a file from a computer.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Music4 } from "lucide-react";

import { toUserMessage } from "@/lib/user-error";
import { uploadMediaFile } from "@/lib/media-upload-client";
import { updateEvent } from "@/lib/events-store";
import { getPieceAudioUrl, listMyPieces } from "@/lib/music-studio.functions";
import { songLengthLabel } from "@/lib/wall-soundtrack";

type Piece = { id: string; kind: string; title: string; seconds: number };

export function InviteSongPicker({
  eventId,
  currentTitle,
}: {
  eventId: string;
  currentTitle?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Demo events sit alongside demo studio pieces, so the demo host can see them.
  const includeDemo = eventId.startsWith("demo-");

  const library = useQuery({
    queryKey: ["invite-song-pieces", includeDemo],
    queryFn: async () => {
      const res = (await listMyPieces({ data: { includeDemo } } as never)) as
        | { pieces?: Piece[] }
        | Piece[];
      const rows = Array.isArray(res) ? res : (res.pieces ?? []);
      return rows.filter((r) => r.kind === "song");
    },
    staleTime: 60_000,
    enabled: open,
  });

  const songs = library.data ?? [];

  async function useSong(piece: Piece) {
    if (busyId) return;
    setBusyId(piece.id);
    const toastId = toast.loading("Switching the song");
    try {
      // Signed links expire, so always take a fresh one before copying.
      const fresh = (
        (await getPieceAudioUrl({ data: { id: piece.id } } as never)) as { url: string | null }
      ).url;
      if (!fresh) throw new Error("That song could not be read.");
      const res = await fetch(fresh);
      if (!res.ok) throw new Error("That song could not be read.");
      const blob = await res.blob();
      const stem = piece.title.replace(/[^\w\s-]/g, "").trim() || "kenroe-song";
      const file = new File([blob], `${stem}.mp3`, { type: blob.type || "audio/mpeg" });
      const publicUrl = await uploadMediaFile(file, {
        source: "invite",
        filename: `${stem}.mp3`,
      });
      updateEvent(eventId, { songUrl: publicUrl, songTitle: piece.title });
      toast.success(`"${piece.title}" is now the invitation song`, { id: toastId });
      setOpen(false);
    } catch (e) {
      toast.error(toUserMessage(e, "Couldn't switch the song."), { id: toastId });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-xl bg-secondary/60 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-card px-4 text-sm font-medium text-ink ring-1 ring-ink/10 hover:bg-ink/5"
      >
        <Music4 className="h-4 w-4 text-velvet" aria-hidden />
        {currentTitle ? "Switch to another saved song" : "Choose a song you already made"}
      </button>
      {open ? (
        <div className="mt-3">
          {library.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading your songs…</p>
          ) : songs.length ? (
            <ul className="space-y-1">
              {songs.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={!!busyId}
                    onClick={() => void useSong(p)}
                    className="flex w-full min-h-[44px] items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-ink/5 disabled:opacity-60"
                  >
                    <span>
                      {p.title}
                      <span className="text-muted-foreground"> · {songLengthLabel(p.seconds)}</span>
                    </span>
                    {busyId === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <span className="text-xs font-medium text-velvet">Use this one</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No saved songs yet.{" "}
              <Link to="/music" className="underline underline-offset-4">
                Make one in Kenroe Sound Studio
              </Link>
              .
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
