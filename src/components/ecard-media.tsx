/**
 * Shared attachment rendering for eCard messages. A message can carry a GIF,
 * a photo, a video and a voice note all at once, so every surface renders the
 * full set through here instead of picking one. Older rows that only stored a
 * single attachment in media_url still work through the legacy fallback.
 */

export type MediaBearing = {
  media_type?: string | null;
  media_url?: string | null;
  gif_url?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  audio_url?: string | null;
};

export type ResolvedMedia = {
  gif?: string;
  image?: string;
  video?: string;
  audio?: string;
  any: boolean;
};

const clean = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t ? t : undefined;
};

export function resolveMedia(item: MediaBearing): ResolvedMedia {
  const legacy = clean(item.media_url);
  const type = item.media_type ?? "none";
  const gif = clean(item.gif_url) ?? (type === "gif" ? legacy : undefined);
  const image = clean(item.image_url) ?? (type === "image" ? legacy : undefined);
  const video = clean(item.video_url) ?? (type === "video" ? legacy : undefined);
  const audio = clean(item.audio_url) ?? (type === "audio" ? legacy : undefined);
  return { gif, image, video, audio, any: Boolean(gif || image || video || audio) };
}

export function ContributionMedia({
  item,
  className,
  mediaClassName,
  name,
}: {
  item: MediaBearing;
  className?: string;
  mediaClassName?: string;
  name?: string;
}) {
  const m = resolveMedia(item);
  if (!m.any) return null;
  const from = name ? `from ${name}` : "on this message";
  const box = mediaClassName ?? "max-h-72 w-full rounded-xl object-contain";
  return (
    <div className={className ?? "mt-3 space-y-3"}>
      {m.audio && (
        <div className="space-y-1.5">
          <audio
            src={m.audio}
            controls
            preload="metadata"
            aria-label={`Voice note ${from}`}
            className="w-full"
          />
          {/* Some browsers, notably older Safari and iPhone, cannot play WebM
              inline, so always offer the file for download as a fallback. */}
          <a
            href={m.audio}
            download
            target="_blank"
            rel="noreferrer"
            className="inline-block text-xs font-medium underline"
          >
            Download voice note
          </a>
        </div>
      )}
      {m.video && (
        <video src={m.video} controls playsInline className={`bg-black ${box}`} />
      )}
      {m.image && <img src={m.image} alt={`Photo ${from}`} loading="lazy" className={box} />}
      {m.gif && <img src={m.gif} alt={`GIF ${from}`} loading="lazy" className={box} />}
    </div>
  );
}
