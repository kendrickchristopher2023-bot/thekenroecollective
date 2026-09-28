// The invitation song: one host-uploaded audio file that guests can play in
// the page and (optionally) download.
//
// It no longer renders its own <audio controls>. A native player owns its own
// sound, which meant this card and the guided playthrough could talk over each
// other and neither Stop reached the other. Playback now goes through the
// page's single controller in `src/lib/invite-audio.ts`.
import { InviteTrackPlayer } from "@/components/invite-audio-controls";

export type EventSong = {
  url: string;
  title?: string | undefined;
  artist?: string | undefined;
  allowDownload?: boolean | undefined;
};

/** Audio types every current mobile and desktop browser can play. */
export const SONG_ACCEPT = "audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,.mp3,.m4a,.aac,.ogg,.wav";
/** Base64 transport plus the media cap leaves comfortable room at 20MB. */
export const SONG_MAX_BYTES = 20 * 1024 * 1024;

export function songFileError(file: File): string | null {
  const name = file.name.toLowerCase();
  const okType = /^audio\//i.test(file.type) || /\.(mp3|m4a|aac|ogg|oga|wav)$/.test(name);
  if (!okType) return "That file isn't audio. Use an MP3, M4A, AAC, OGG or WAV file.";
  if (file.size > SONG_MAX_BYTES) return "That song is over 20MB. Try a shorter or lower-bitrate file.";
  return null;
}

/** Strips a storage cache-buster and path so downloads get a friendly filename. */
export function songDownloadName(song: EventSong): string {
  const fromUrl = decodeURIComponent(song.url.split("?")[0]?.split("/").pop() ?? "");
  const ext = /\.(mp3|m4a|aac|ogg|oga|wav)$/i.exec(fromUrl)?.[0] ?? ".mp3";
  const stem = (song.title || fromUrl.replace(/\.[a-z0-9]+$/i, "") || "event-song")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${stem || "event-song"}${ext}`;
}

export function EventSongCard({
  song,
  className,
  accent,
}: {
  song: EventSong;
  className?: string;
  accent?: string | null;
}) {
  const download = song.allowDownload !== false;
  const title = song.title?.trim() || "Our song";

  return (
    <div className={`rounded-2xl bg-card p-5 ring-1 ring-ink/5 sm:col-span-2 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden>🎧</span>
          <h4 className="font-serif text-lg">{title}</h4>
        </div>
        {download && (
          <a
            href={song.url}
            download={songDownloadName(song)}
            className="inline-flex min-h-9 items-center rounded-full px-3 py-1 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-secondary"
          >
            ⬇ Download
          </a>
        )}
      </div>
      {song.artist?.trim() && (
        <p className="mt-1 text-xs text-muted-foreground">{song.artist.trim()}</p>
      )}
      <InviteTrackPlayer
        className="mt-3"
        accent={accent ?? null}
        track={{ id: `song:${song.url}`, url: song.url, label: title }}
      />
      <p className="mt-2 text-[11px] text-muted-foreground">
        Only one thing plays at a time, so starting this stops anything else.{" "}
        {download ? "Use Download to keep a copy." : "Playback only."}
      </p>
    </div>
  );
}
