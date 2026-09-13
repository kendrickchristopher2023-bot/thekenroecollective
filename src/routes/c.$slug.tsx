import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { draftEcardMessage, getPublicEcard, submitContribution } from "@/lib/ecards.functions";
import { getEcardTheme } from "@/lib/ecard-themes";
import { GiphyPicker } from "@/components/giphy-picker";
import { VoiceNoteRecorder } from "@/components/ecard-voice-recorder";
import { supabase } from "@/integrations/supabase/client";
import { useLocalDateTime } from "@/lib/ecards-time";
import {
  ContributorRevealCountdown,
  useRevealCountdown,
} from "@/components/ecard-countdown";
import type { PublicEcard } from "@/lib/ecards.schemas";
import { GlobalErrorFallback } from "@/components/global-error-fallback";

export const Route = createFileRoute("/c/$slug")({
  loader: ({ params }) => getPublicEcard({ data: { slug: params.slug } }),
  head: ({ loaderData }) => {
    const card = loaderData?.card;
    const title = card
      ? `Add a message for ${card.recipient_name}`
      : "Group card — The Kenroe Collective";
    const description = card
      ? `Sign the group card for ${card.recipient_name}. Your message stays hidden until the reveal.`
      : "Sign a group greeting card from The Kenroe Collective.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  errorComponent: GlobalErrorFallback,
  notFoundComponent: () => (
    <div className="grid min-h-[60vh] place-items-center px-6 py-16 text-center">
      <div className="max-w-md">
        <h1 className="font-serif text-3xl text-ink">We couldn't find this card</h1>
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
  component: ContributePage,
});

function ContributePage() {
  const { card } = Route.useLoaderData() as { card: PublicEcard | null };
  // Reveal time in the viewer's own device time zone, with a zone label.
  const revealLocal = useLocalDateTime(card?.reveal_date);
  // Live countdown, also used to close signing once the reveal moment passes.
  const countdown = useRevealCountdown(card?.reveal_date);
  const pastReveal = !!card && !!countdown && countdown.done;



  const { slug } = Route.useParams();
  const send = useServerFn(submitContribution);
  const draft = useServerFn(draftEcardMessage);

  const theme = getEcardTheme(card?.theme);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [gifUrl, setGifUrl] = useState<string | undefined>(undefined);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [videoUrl, setVideoUrl] = useState<string | undefined>(undefined);
  const [audioUrl, setAudioUrl] = useState<string | undefined>(undefined);
  // Each attachment is its own independent slot. Opening or closing one panel
  // never touches the other attachments, so a message can carry a GIF, a photo,
  // a video and a voice note at the same time.
  const [open, setOpen] = useState<{ gif: boolean; image: boolean; video: boolean; audio: boolean }>(
    { gif: false, image: false, video: false, audio: false },
  );
  const toggleSlot = (k: "gif" | "image" | "video" | "audio") =>
    setOpen((o) => ({ ...o, [k]: !o[k] }));
  const [hint, setHint] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [editToken, setEditToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /**
   * A token this browser has already used on this card, so a contributor can
   * get back to their own message without hunting for the email or link. The
   * token stays the only source of truth, and it only ever unlocks the one
   * message it belongs to.
   */
  const [savedToken, setSavedToken] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty("--ecard-bg", theme.bg);
  }, [theme.bg]);

  useEffect(() => {
    try {
      setSavedToken(window.localStorage.getItem(`ecard.editToken.${slug}`));
    } catch {
      setSavedToken(null);
    }
  }, [slug]);

  if (!card) {
    return (
      <div className="grid min-h-[70vh] place-items-center px-4 text-center">
        <div>
          <p className="text-4xl" aria-hidden>
            💌
          </p>
          <h1 className="mt-3 font-display text-2xl text-ink">This card link is not available</h1>
          <p className="mt-2 text-sm text-ink/60">
            Double check the link with whoever invited you.
          </p>
        </div>
      </div>
    );
  }

  if (card.revealed || pastReveal) {
    return (
      <div className="venture-ecards min-h-[70vh] px-4 py-12" style={{ background: theme.bg }}>
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
          <p className="mt-3 text-base leading-relaxed" style={{ opacity: 0.78 }}>
            {card.recipient_name} has it now, so new messages and edits are closed. Thank you for
            thinking of them.
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
          ? "That video is too large. Please keep it under 40MB, around one minute."
          : "That photo is too large. Please keep it under 10MB.",
      );
      return;
    }
    setUploading(true);
    setErr(null);
    try {
      const fallbackExt = kind === "video" ? "mp4" : "jpg";
      const ext = (file.name.split(".").pop() || fallbackExt).toLowerCase().slice(0, 5);
      const path = `${slug}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("ecard-media").upload(path, file, {
        contentType: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
        upsert: false,
      });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("ecard-media").getPublicUrl(path);
      if (kind === "video") setVideoUrl(data.publicUrl);
      else setImageUrl(data.publicUrl);
    } catch {
      setErr(
        kind === "video"
          ? "That video would not upload. Try a shorter clip."
          : "That photo would not upload. Try a smaller image.",
      );
    } finally {
      setUploading(false);
    }
  };

  const help = async () => {
    setDrafting(true);
    setErr(null);
    try {
      const res = await draft({ data: { slug, hint, contributorName: name } });
      if ("message" in res) setMessage(res.message);
      else setErr(res.error);
    } catch {
      setErr("Message help is unavailable right now.");
    } finally {
      setDrafting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErr("Please add your name so they know who it is from.");
      return;
    }
    if (!message.trim() && !gifUrl && !imageUrl && !videoUrl && !audioUrl) {
      setErr("Add a message, a voice note, a GIF, or a photo.");
      return;
    }
    setSaving(true);
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
      const res = await send({
        data: {
          slug,
          contributorName: name.trim(),
          message: message.trim(),
          mediaType,
          gifUrl: gifUrl ?? null,
          mediaUrl: audioUrl ?? videoUrl ?? imageUrl ?? null,
          imageUrl: imageUrl ?? null,
          videoUrl: videoUrl ?? null,
          audioUrl: audioUrl ?? null,
        },
      });
      if (res.ok) {
        setEditToken(res.editToken ?? null);
        if (res.editToken) {
          try {
            window.localStorage.setItem(`ecard.editToken.${slug}`, res.editToken);
          } catch {
            // Private browsing can block storage. The link on screen still works.
          }
        }
        setDone(true);
      }
      else setErr(res.error ?? "We could not save your message.");
    } catch {
      setErr("We could not save your message. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-[80vh] px-4 py-12" style={{ background: theme.bg }}>
        <div
          className="mx-auto max-w-md rounded-3xl p-8 text-center shadow-sm"
          style={{ background: theme.surface, color: theme.ink }}
        >
          <p className="text-5xl" aria-hidden>
            {theme.motif}
          </p>
          <h1 className="mt-4 font-display text-2xl" style={{ fontFamily: theme.display }}>
            Your message is in
          </h1>
          <p className="mt-3 text-base leading-relaxed" style={{ opacity: 0.8 }}>
            It stays sealed until {revealLocal}, so{" "}
            {card.recipient_name} sees everything at once. Nobody else can read it before then,
            including you.
          </p>
          <p className="mt-3 text-base font-medium leading-relaxed">
            You can change or update your message any time before{" "}
            {revealLocal}. After the reveal it is locked.
          </p>
          {editToken && (
            <div className="mt-5 rounded-2xl p-4 text-left" style={{ background: `${theme.ink}0D` }}>
              <p className="text-sm font-medium">Your private edit link</p>
              <p className="mt-1 text-sm" style={{ opacity: 0.75 }}>
                Please save this link, for example email it to yourself or bookmark it. It is the
                only way back to your message, only you have it, and it never shows anyone else's
                message.
              </p>
              <input
                readOnly
                aria-label="Your private edit link"
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/ec/${editToken}`}
                className="mt-2 w-full rounded-lg border px-2.5 py-2 text-sm"
                style={{ borderColor: `${theme.ink}26`, background: "transparent", color: theme.ink }}
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`${window.location.origin}/ec/${editToken}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  } catch {
                    setCopied(false);
                  }
                }}
                className="mt-2 inline-flex min-h-11 items-center rounded-full px-5 py-2.5 text-sm font-medium"
                style={{ background: theme.accent, color: theme.accentInk }}
              >
                {copied ? "Copied" : "Copy my edit link"}
              </button>
              <a
                href={`/ec/${editToken}`}
                className="mt-2 ml-2 inline-flex min-h-11 items-center rounded-full border px-5 py-2.5 text-sm font-medium"
                style={{ borderColor: `${theme.ink}33`, color: theme.ink }}
              >
                Edit my message now
              </a>
            </div>
          )}
          <p className="mt-5 text-xs" style={{ opacity: 0.6 }}>
            Pass the link on to anyone else who should sign it.
          </p>
        </div>
      </div>
    );
  }

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
          {card.occasion} for {card.recipient_name}
        </h1>
        <p className="mt-2 text-base" style={{ opacity: 0.75 }}>
          Add your message below. Everything is revealed together on {revealLocal}.
        </p>

        <ContributorRevealCountdown
          revealDate={card.reveal_date}
          contributionCount={card.contribution_count}
        />



        {savedToken && (
          <div className="mt-5 rounded-2xl p-4" style={{ background: `${theme.ink}0D` }}>
            <p className="text-base font-medium">You have already signed this card</p>
            <p className="mt-1 text-sm" style={{ opacity: 0.75 }}>
              You can change or update your own message any time before the reveal.
            </p>
            <a
              href={`/ec/${savedToken}`}
              className="mt-3 inline-flex min-h-11 items-center rounded-full px-5 py-2.5 text-sm font-medium"
              style={{ background: theme.accent, color: theme.accentInk }}
            >
              Edit my message
            </a>
          </div>
        )}

        <form onSubmit={submit} className="mt-7 space-y-6">
          <div>
            <label htmlFor="cname" className="block text-sm font-medium">
              Your name
            </label>
            <input
              id="cname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="e.g. Sam from the design team"
              className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm"
              style={{ borderColor: `${theme.ink}26`, background: "transparent", color: theme.ink }}
            />
          </div>

          <div>
            <label htmlFor="cmsg" className="block text-sm font-medium">
              Your message
            </label>
            <textarea
              id="cmsg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="Say something they will keep."
              className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm"
              style={{ borderColor: `${theme.ink}26`, background: "transparent", color: theme.ink }}
            />
            <div className="mt-2 rounded-xl p-3" style={{ background: `${theme.ink}0D` }}>
              <label htmlFor="chint" className="block text-xs font-medium">
                Stuck? Give a hint and let AI draft it
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  id="chint"
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  maxLength={400}
                  placeholder="e.g. worked together 5 years, always brought cake"
                  className="flex-1 rounded-lg border px-4 py-3 text-base"
                  style={{ borderColor: `${theme.ink}26`, background: "transparent", color: theme.ink }}
                />
                <button
                  type="button"
                  onClick={help}
                  disabled={drafting}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-3 text-sm font-medium disabled:opacity-60"
                  style={{ background: theme.accent, color: theme.accentInk }}
                >
                  {drafting ? "Writing..." : "Help me write it"}
                </button>
              </div>
            </div>
          </div>

          <div>
            <span className="block text-sm font-medium">
              Add something extra (optional), you can add a GIF, a photo, a video and a voice note
              together
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["audio", "gif", "image", "video"] as const).map((t) => {
                const added =
                  t === "audio" ? audioUrl : t === "gif" ? gifUrl : t === "image" ? imageUrl : videoUrl;
                const label =
                  t === "audio"
                    ? "Voice note"
                    : t === "gif"
                      ? "GIF"
                      : t === "image"
                        ? "Photo"
                        : "Video";
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
                  slug={slug}
                  value={audioUrl}
                  onChange={setAudioUrl}
                  tone={{ ink: theme.ink, accent: theme.accent, accentInk: theme.accentInk }}
                />
              </div>
            )}

            {(open.gif || gifUrl) && (
              <div className="mt-3">
                <GiphyPicker
                  value={gifUrl}
                  onChange={setGifUrl}
                />
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
                {uploading && <p className="mt-2 text-xs">Uploading...</p>}
                {imageUrl && (
                  <>
                    <img
                      src={imageUrl}
                      alt="Your upload"
                      className="mt-3 max-h-48 rounded-xl object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setImageUrl(undefined)}
                      className="mt-2 rounded-full border px-4 py-1.5 text-xs font-medium"
                      style={{ borderColor: `${theme.ink}26`, color: theme.ink }}
                    >
                      Remove photo
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
                <p className="mt-1.5 text-[11px]" style={{ opacity: 0.6 }}>
                  Keep it short and under 40MB, roughly a minute.
                </p>
                {uploading && <p className="mt-2 text-xs">Uploading...</p>}
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
                      onClick={() => setVideoUrl(undefined)}
                      className="mt-2 rounded-full border px-4 py-1.5 text-xs font-medium"
                      style={{ borderColor: `${theme.ink}26`, color: theme.ink }}
                    >
                      Remove video
                    </button>
                  </>
                )}
              </div>
            )}
          </div>


          {err && <p className="text-sm text-destructive">{err}</p>}

          <button
            type="submit"
            disabled={saving || uploading}
            className="w-full rounded-full px-6 py-3 text-sm font-medium disabled:opacity-60"
            style={{ background: theme.accent, color: theme.accentInk }}
          >
            {saving ? "Sending..." : "Add my message"}
          </button>
          <p className="text-center text-[11px]" style={{ opacity: 0.55 }}>
            Group eCards by The Kenroe Collective. Unlimited contributors, always.
          </p>
        </form>
      </div>
    </div>
  );
}
