import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  deleteMyContributionByToken,
  getMyContributionByToken,
  removeMyContributionMediaByToken,
  updateMyContributionByToken,
} from "@/lib/ecards.functions";
import {
  confirmRemoveMedia,
  removeMediaLabel,
  type EcardMediaSlot,
} from "@/lib/ecard-media-slots";
import { getEcardTheme } from "@/lib/ecard-themes";
import { GiphyPicker } from "@/components/giphy-picker";
import { VoiceNoteRecorder } from "@/components/ecard-voice-recorder";
import { supabase } from "@/integrations/supabase/client";
import type { MyContribution } from "@/lib/ecards.schemas";
import { confirmDialog } from "@/lib/confirm-dialog";
import { formatStampDate } from "@/lib/datetime";
import { GlobalErrorFallback } from "@/components/global-error-fallback";

export const Route = createFileRoute("/ec/$token")({
  loader: ({ params }) => getMyContributionByToken({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: "Edit your card message — The Kenroe Collective" },
      {
        name: "description",
        content: "Change or remove your own message on a group card before it is revealed.",
      },
      { property: "og:title", content: "Edit your card message" },
      {
        property: "og:description",
        content: "Change or remove your own message on a group card before it is revealed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: GlobalErrorFallback,
  notFoundComponent: () => (
    <div className="grid min-h-[60vh] place-items-center px-6 py-16 text-center">
      <div className="max-w-md">
        <h1 className="font-serif text-3xl text-ink">We couldn't find your message</h1>
        <p className="mt-3 text-base text-muted-foreground">
          The link may be incomplete or out of date. Ask whoever sent it to share it again.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-full border border-ink/15 px-6 py-2.5 text-sm font-medium text-ink hover:bg-ink/5"
        >
          Go to the home page
        </a>
      </div>
    </div>
  ),
  component: EditContributionPage,
});

function EditContributionPage() {
  const { contribution } = Route.useLoaderData() as { contribution: MyContribution | null };
  const { token } = Route.useParams();
  const save = useServerFn(updateMyContributionByToken);
  const drop = useServerFn(deleteMyContributionByToken);
  const dropMedia = useServerFn(removeMyContributionMediaByToken);

  const theme = getEcardTheme(contribution?.theme);
  const [message, setMessage] = useState(contribution?.message ?? "");
  const [gifUrl, setGifUrl] = useState<string | undefined>(contribution?.gif_url ?? undefined);
  const [imageUrl, setImageUrl] = useState<string | undefined>(
    contribution?.image_url ??
      (contribution?.media_type === "image" ? (contribution.media_url ?? undefined) : undefined),
  );
  const [videoUrl, setVideoUrl] = useState<string | undefined>(
    contribution?.video_url ??
      (contribution?.media_type === "video" ? (contribution.media_url ?? undefined) : undefined),
  );
  const [audioUrl, setAudioUrl] = useState<string | undefined>(
    contribution?.audio_url ??
      (contribution?.media_type === "audio" ? (contribution.media_url ?? undefined) : undefined),
  );
  // Independent slots: toggling one panel never clears another attachment.
  const [open, setOpen] = useState<{ gif: boolean; image: boolean; video: boolean; audio: boolean }>(
    { gif: false, image: false, video: false, audio: false },
  );
  const toggleSlot = (k: "gif" | "image" | "video" | "audio") =>
    setOpen((o) => ({ ...o, [k]: !o[k] }));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    setSaved(false);
  }, [message, gifUrl, imageUrl, videoUrl, audioUrl]);

  if (!contribution) {
    return (
      <div className="grid min-h-[70vh] place-items-center px-4 text-center">
        <div>
          <p className="text-4xl" aria-hidden>
            💌
          </p>
          <h1 className="mt-3 font-display text-2xl text-ink">This edit link is not valid</h1>
          <p className="mt-2 text-sm text-ink/60">
            It may have already been used to remove the message.
          </p>
        </div>
      </div>
    );
  }

  if (removed) {
    return (
      <div className="min-h-[70vh] px-4 py-12" style={{ background: theme.bg }}>
        <div
          className="mx-auto max-w-md rounded-3xl p-8 text-center shadow-sm"
          style={{ background: theme.surface, color: theme.ink }}
        >
          <h1 className="font-display text-2xl" style={{ fontFamily: theme.display }}>
            Your message has been removed
          </h1>
          <p className="mt-3 text-sm" style={{ opacity: 0.75 }}>
            Nothing of yours will appear on the card. You can always add a new message from the
            original link.
          </p>
        </div>
      </div>
    );
  }

  if (contribution.locked) {
    return (
      <div className="min-h-[70vh] px-4 py-12" style={{ background: theme.bg }}>
        <div
          className="mx-auto max-w-md rounded-3xl p-8 text-center shadow-sm"
          style={{ background: theme.surface, color: theme.ink }}
        >
          <p className="text-4xl" aria-hidden>
            {theme.motif}
          </p>
          <h1 className="mt-3 font-display text-2xl" style={{ fontFamily: theme.display }}>
            This card has already been sent
          </h1>
          <p className="mt-3 text-sm" style={{ opacity: 0.75 }}>
            {contribution.recipient_name} has it now, so messages are locked. Thank you for signing
            it.
          </p>
        </div>
      </div>
    );
  }

  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

  const upload = async (file: File, kind: "image" | "video") => {
    const cap = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > cap) {
      setErr(
        kind === "video"
          ? "That video is too large. Please keep it under 40MB."
          : "That photo is too large. Please keep it under 10MB.",
      );
      return;
    }
    setUploading(true);
    setErr(null);
    try {
      const fallbackExt = kind === "video" ? "mp4" : "jpg";
      const ext = (file.name.split(".").pop() || fallbackExt).toLowerCase().slice(0, 5);
      const path = `${contribution.public_slug}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("ecard-media").upload(path, file, {
        contentType: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
        upsert: false,
      });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("ecard-media").getPublicUrl(path);
      if (kind === "video") setVideoUrl(data.publicUrl);
      else setImageUrl(data.publicUrl);
    } catch {
      setErr("That file would not upload. Please try another one.");
    } finally {
      setUploading(false);
    }
  };

  /**
   * Remove one attachment only. The server clears just that column and deletes
   * the uploaded file behind it, so the message text and the other attachments
   * are left exactly as they were.
   */
  const removeSlot = async (slot: EcardMediaSlot) => {
    if (!(await confirmRemoveMedia(slot))) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await dropMedia({ data: { token, slot } });
      if (!res.ok) {
        setErr(res.error ?? "We could not remove that attachment.");
        return;
      }
      if (slot === "gif") setGifUrl(undefined);
      if (slot === "image") setImageUrl(undefined);
      if (slot === "video") setVideoUrl(undefined);
      if (slot === "audio") setAudioUrl(undefined);
      setOpen((o) => ({ ...o, [slot]: false }));
    } catch {
      setErr("We could not remove that attachment. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && !gifUrl && !imageUrl && !videoUrl && !audioUrl) {
      setErr("Add a message, a voice note, a GIF, a photo, or a video.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const mediaType = gifUrl
        ? "gif"
        : audioUrl
          ? "audio"
          : videoUrl
            ? "video"
            : imageUrl
              ? "image"
              : "none";
      const res = await save({
        data: {
          token,
          message: message.trim(),
          mediaType,
          gifUrl: gifUrl ?? null,
          mediaUrl: audioUrl ?? videoUrl ?? imageUrl ?? null,
          imageUrl: imageUrl ?? null,
          videoUrl: videoUrl ?? null,
          audioUrl: audioUrl ?? null,
        },
      });
      if (res.ok) setSaved(true);
      else setErr(res.error ?? "We could not save your changes.");
    } catch {
      setErr("We could not save your changes. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="venture-ecards min-h-dvh px-4 py-8 sm:py-12" style={{ background: theme.bg }}>
      <div
        className="mx-auto max-w-lg rounded-3xl p-6 shadow-sm sm:p-8"
        style={{ background: theme.surface, color: theme.ink }}
      >
        <p className="text-4xl" aria-hidden>
          {theme.motif}
        </p>
        <h1 className="mt-3 font-display text-2xl sm:text-3xl" style={{ fontFamily: theme.display }}>
          Your message for {contribution.recipient_name}
        </h1>
        <p className="mt-2 text-sm" style={{ opacity: 0.72 }}>
          Signed as {contribution.contributor_name}. You can change or remove it until the reveal on{" "}
          {formatStampDate((contribution.reveal_date))}.
        </p>

        <form onSubmit={submit} className="mt-7 space-y-6">
          <div>
            <label htmlFor="emsg" className="block text-sm font-medium">
              Your message
            </label>
            <textarea
              id="emsg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={2000}
              className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm"
              style={{ borderColor: `${theme.ink}26`, background: "transparent", color: theme.ink }}
            />
          </div>

          <div>
            <span className="block text-sm font-medium">
              Attachments, you can keep a GIF, a photo, a video and a voice note together
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["audio", "gif", "image", "video"] as const).map((t) => {
                const added =
                  t === "audio" ? audioUrl : t === "gif" ? gifUrl : t === "image" ? imageUrl : videoUrl;
                const label =
                  t === "audio" ? "Voice note" : t === "gif" ? "GIF" : t === "image" ? "Photo" : "Video";
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleSlot(t)}
                    aria-pressed={open[t]}
                    className="inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium"
                    style={
                      open[t] || added
                        ? { background: theme.accent, color: theme.accentInk, borderColor: theme.accent }
                        : { borderColor: `${theme.ink}26`, color: theme.ink }
                    }
                  >
                    {`${label}${added ? " (added)" : ""}`}
                  </button>
                );
              })}
            </div>

            {(open.audio || audioUrl) && (
              <div className="mt-3">
                <VoiceNoteRecorder
                  slug={contribution.public_slug}
                  value={audioUrl}
                  onChange={setAudioUrl}
                  tone={{ ink: theme.ink, accent: theme.accent, accentInk: theme.accentInk }}
                  onRemove={() => void removeSlot("audio")}
                />
                <p className="mt-1.5 text-[11px]" style={{ opacity: 0.6 }}>
                  To swap a voice note, remove this one and record a new one.
                </p>
              </div>
            )}

            {(open.gif || gifUrl) && (
              <div className="mt-3">
                <GiphyPicker
                  value={gifUrl}
                  onChange={setGifUrl}
                />
                {gifUrl && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeSlot("gif")}
                    className="mt-2 rounded-full border px-4 py-1.5 text-xs font-medium disabled:opacity-60"
                    style={{ borderColor: `${theme.ink}26`, color: theme.ink }}
                  >
                    {removeMediaLabel("gif")}
                  </button>
                )}
              </div>
            )}

            {(open.image || imageUrl) && (
              <div className="mt-3">
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Upload a photo"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f, "image");
                  }}
                  className="block w-full text-xs"
                />
                {imageUrl && (
                  <>
                    <img src={imageUrl} alt="Your upload" className="mt-3 max-h-48 rounded-xl object-cover" />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeSlot("image")}
                      className="mt-2 rounded-full border px-4 py-1.5 text-xs font-medium disabled:opacity-60"
                      style={{ borderColor: `${theme.ink}26`, color: theme.ink }}
                    >
                      {removeMediaLabel("image")}
                    </button>
                  </>
                )}
              </div>
            )}

            {(open.video || videoUrl) && (
              <div className="mt-3">
                <input
                  type="file"
                  accept="video/*"
                  aria-label="Upload a short video"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f, "video");
                  }}
                  className="block w-full text-xs"
                />
                {videoUrl && (
                  <>
                    <video
                      src={videoUrl}
                      controls
                      playsInline
                      className="mt-3 max-h-48 w-full rounded-xl bg-black object-contain"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeSlot("video")}
                      className="mt-2 rounded-full border px-4 py-1.5 text-xs font-medium disabled:opacity-60"
                      style={{ borderColor: `${theme.ink}26`, color: theme.ink }}
                    >
                      {removeMediaLabel("video")}
                    </button>
                  </>
                )}
              </div>
            )}
            {uploading && <p className="mt-2 text-xs">Uploading...</p>}

          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}
          {saved && (
            <p className="text-sm" style={{ opacity: 0.8 }}>
              Saved. Your message is updated.
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={busy || uploading}
              className="flex-1 rounded-full px-6 py-3 text-sm font-medium disabled:opacity-60"
              style={{ background: theme.accent, color: theme.accentInk }}
            >
              {busy ? "Saving..." : "Save changes"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (
                  !(await confirmDialog({
                    title: "Remove your message from this card?",
                    body: "Your note and any attachments you added will be taken off the card. You can add a new message afterwards.",
                    confirmLabel: "Yes, remove it",
                  }))
                )
                  return;
                setBusy(true);
                setErr(null);
                try {
                  const res = await drop({ data: { token } });
                  if (res.ok) setRemoved(true);
                  else setErr(res.error ?? "We could not remove your message.");
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-full border px-6 py-3 text-sm font-medium disabled:opacity-60"
              style={{ borderColor: `${theme.ink}33`, color: theme.ink }}
            >
              Remove my message
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
