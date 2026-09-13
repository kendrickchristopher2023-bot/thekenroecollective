/**
 * "Use on an event invitation" for a saved Sound Studio piece.
 *
 * The invitation song is a plain public audio URL on the event, so a studio
 * piece has to be copied out of the private sound-pieces bucket into the same
 * public media storage every other invitation asset uses. We do that copy
 * explicitly here rather than making the private bucket public, so a paid
 * piece is never browsable and only the pieces a host chooses go out.
 */
import { toUserMessage } from "@/lib/user-error";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Music4 } from "lucide-react";

import { uploadMediaFile } from "@/lib/media-upload-client";
import { updateEvent, useEvents } from "@/lib/events-store";
import { getPieceAudioUrl } from "@/lib/music-studio.functions";

export function StudioUseOnEvent({
  pieceId,
  title,
  url,
}: {
  pieceId: string;
  title: string;
  url: string | null;
}) {
  const events = useEvents();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const mine = events.slice(0, 40);

  async function attach(eventId: string) {
    if (busy) return;
    setBusy(true);
    const toastId = toast.loading("Adding the music to that invitation");
    try {
      // Signed links expire, so always take a fresh one before copying.
      const fresh =
        ((await getPieceAudioUrl({ data: { id: pieceId } } as never)) as { url: string | null })
          .url ?? url;
      if (!fresh) throw new Error("That piece could not be read.");
      const res = await fetch(fresh);
      if (!res.ok) throw new Error("That piece could not be read.");
      const blob = await res.blob();
      const stem = title.replace(/[^\w\s-]/g, "").trim() || "kenroe-sound";
      const file = new File([blob], `${stem}.mp3`, { type: blob.type || "audio/mpeg" });
      const publicUrl = await uploadMediaFile(file, {
        source: "invite",
        filename: `${stem}.mp3`,
      });
      updateEvent(eventId, {
        songUrl: publicUrl,
        songTitle: title,
        songAllowDownload: true,
      });
      toast.success("Added to that invitation", { id: toastId });
      setOpen(false);
    } catch (e) {
      toast.error(toUserMessage(e, "Couldn't add that music."), { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  if (!mine.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-ink/70 ring-1 ring-ink/15 hover:bg-ink/5"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music4 className="h-4 w-4" />}
        Use on an event
      </button>
      {open ? (
        <div className="mt-2 w-full rounded-2xl border border-ink/10 bg-white p-3">
          <p className="text-xs text-ink/55">
            Pick the event. Guests will hear it on the invitation page and in the invitation
            email.
          </p>
          <ul className="mt-2 space-y-1">
            {mine.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void attach(e.id)}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-ink/5 disabled:opacity-60"
                >
                  {e.title || "Untitled event"}
                  {e.songTitle ? (
                    <span className="text-ink/45"> · replaces "{e.songTitle}"</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
