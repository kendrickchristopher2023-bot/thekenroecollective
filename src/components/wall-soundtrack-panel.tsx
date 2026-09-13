// Host controls for the Photo Wall soundtrack: upload your own tracks, paste a
// streaming playlist link (rendered as the provider's own embedded player, never mixed into our
// page), or compose an original song with AI. Order is drag-free and explicit,
// using up/down controls so it works on a phone as well as a laptop.
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  listWallMusic,
  uploadWallMusic,
  deleteWallMusic,
  addWallMusicLink,
  generateWallSong,
  sampleWallSong,
  regenerateWallSong,
  listReusableAiSongs,
  copyWallSongToEvent,
  reorderWallMusic,
  renameWallMusic,
  draftWallSongWords,

} from "@/lib/photo-wall.functions";
import {
  DEFAULT_SONG_SETTINGS,
  GENRES,
  LINK_PROVIDER_LABELS,
  MAX_AI_TRACKS,
  MAX_UPLOAD_TRACKS,
  MOODS,
  MUSIC_LICENCE_TEXT,
  MAX_MUSIC_SECONDS,
  SAMPLE_HOURLY_UNITS,
  SAMPLE_LENGTH_CHOICES,
  SAMPLE_SONG_SECONDS,
  AI_SONG_SECONDS,
  AI_SONG_LENGTH_CHOICES,
  composeWaitLabel,
  songLengthLabel,
  poemWordBudget,
  POEM_STYLES,
  POEM_STYLE_HINTS,
  POEM_VOICES,
  VOICES,
  voiceOptions,
  type AiSongLength,
  type LinkProvider,
  type PieceKind,
  type SampleLength,
  type SongSettings,


} from "@/lib/wall-soundtrack";
import { analyseAudioFile } from "@/lib/audio-analyze";
import { confirmDialog } from "@/lib/confirm-dialog";
import {
  listSamples,
  removeSample,
  saveSample,
  sampleAgeLabel,
  samplePlayable,

  SHELF_LIMIT,
  type ShelfSample,
} from "@/lib/sample-shelf";

import { updateEvent, useEvent } from "@/lib/events-store";
import { WallPieceLibrary } from "@/components/wall-piece-library";

type Row = {
  id: string;
  title: string;
  artist: string | null;
  source: "upload" | "ai" | "link";
  seconds: number | null;
  url: string | null;
  bpm: number | null;
  link: { url: string; provider: string; title: string; artUrl: string | null } | null;
};

type ReusableSong = {
  trackId: string;
  eventId: string;
  eventTitle: string;
  title: string;
  artist: string | null;
  seconds: number | null;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function mmss(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function WallSoundtrackPanel({ eventId }: { eventId: string }) {
  const kevent = useEvent(eventId);
  const [rows, setRows] = useState<Row[]>([]);
  const [licence, setLicence] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [song, setSong] = useState<SongSettings>(DEFAULT_SONG_SETTINGS);
  const [composing, setComposing] = useState(false);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  /**
   * A letter is not composed here. It is written and read aloud in the studio,
   * because the writer has to approve every word first, so this panel places a
   * saved one rather than pretending to generate it in a single click.
   */
  const [letterMode, setLetterMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [reuseOpen, setReuseOpen] = useState(false);
  const [reusable, setReusable] = useState<ReusableSong[] | null>(null);
  /** Which sample length is being made right now, so only that button waits. */
  const [sampling, setSampling] = useState<SampleLength | null>(null);
  /** Which writing helper is running: strengthening the brief, or writing the verse. */
  const [writing, setWriting] = useState<"brief" | "poem" | null>(null);
  /** What the description said before the assistant rewrote it, so it can be put back. */
  const [wordsBefore, setWordsBefore] = useState<string | null>(null);

  /** Full-song length the host has chosen, in seconds. */
  const [songSeconds, setSongSeconds] = useState<AiSongLength>(AI_SONG_SECONDS);
  const [sample, setSample] = useState<{
    url: string;
    prompt: string;
    used: number;
    left: number;
    seconds: number;
  } | null>(null);
  /** Every sample taken on this device for this event, newest first. Survives a refresh. */
  const [shelf, setShelf] = useState<ShelfSample[]>([]);
  /** Blob URLs for shelf playback, made once per sample and released on unmount. */
  const [shelfUrls, setShelfUrls] = useState<Record<string, string>>({});


  /**
   * The song we just finished composing. The saved-track list sits at the top of
   * this panel, well above the compose form, so a host who has scrolled down to
   * write the prompt never sees the new arrival. This keeps it in front of them.
   */
  const [justAdded, setJustAdded] = useState<Row | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);


  const draftKey = `kenroe:wall-song-draft:${eventId}`;

  // Bring back the last words / genre / mood / voice choices so a host never
  // retypes before taking another sample.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<SongSettings> & {
        title?: string;
        artist?: string;
      };
      setSong((prev) => ({
        ...prev,
        kind: saved.kind === "poem" || saved.kind === "song" ? saved.kind : prev.kind,
        words: typeof saved.words === "string" ? saved.words : prev.words,
        genre: typeof saved.genre === "string" ? saved.genre : prev.genre,
        mood: typeof saved.mood === "string" ? saved.mood : prev.mood,
        voice: typeof saved.voice === "string" ? saved.voice : prev.voice,
        poemStyle: typeof saved.poemStyle === "string" ? saved.poemStyle : prev.poemStyle,
        poemText: typeof saved.poemText === "string" ? saved.poemText : prev.poemText,
        tempo: typeof saved.tempo === "number" ? saved.tempo : prev.tempo,
        bass: typeof saved.bass === "number" ? saved.bass : prev.bass,
        brightness: typeof saved.brightness === "number" ? saved.brightness : prev.brightness,

      }));
      if (typeof saved.title === "string") setSongTitle(saved.title);
      if (typeof saved.artist === "string") setSongArtist(saved.artist);
    } catch {
      /* a missing or corrupt draft is not worth surfacing */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        draftKey,
        JSON.stringify({ ...song, title: songTitle, artist: songArtist }),
      );
    } catch {
      /* storage full or blocked: the panel still works */
    }
  }, [draftKey, song, songTitle, songArtist]);

  // Release the sample's blob URL when it is replaced or the panel closes.
  useEffect(() => {
    const url = sample?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [sample?.url]);

  /**
   * Puts the saved shelf on screen and makes a playable URL for each sample.
   * Runs once per event, and again whenever a new sample is taken or removed.
   */
  const refreshShelf = useCallback(async (eid: string) => {
    const saved = await listSamples(eid);
    setShelf(saved);
    setShelfUrls((prev) => {
      const next: Record<string, string> = {};
      for (const s of saved) {
        // A browser can throw away a sample's audio and keep the note about it,
        // so this never assumes there is something to play.
        if (!samplePlayable(s)) continue;
        next[s.id] = prev[s.id] ?? URL.createObjectURL(s.audio);
      }
      // Anything no longer on the shelf loses its URL here.
      for (const [id, url] of Object.entries(prev)) if (!next[id]) URL.revokeObjectURL(url);
      return next;
    });
  }, []);


  useEffect(() => {
    void refreshShelf(eventId);
  }, [eventId, refreshShelf]);

  // Release every shelf URL when the panel closes.
  useEffect(
    () => () => {
      setShelfUrls((prev) => {
        for (const url of Object.values(prev)) URL.revokeObjectURL(url);
        return {};
      });
    },
    [],
  );


  const load = useCallback(async () => {
    try {
      const data = await listWallMusic({ data: { eventId } });
      const next: Row[] = data.map((r) => ({
        id: r.id,
        title: r.title,
        artist: r.artist,
        source: r.source,
        seconds: r.seconds,
        url: r.url,
        bpm: r.bpm,
        link: r.link,
      }));
      setRows(next);
      return next;
    } catch {
      /* non-critical */
      return [] as Row[];
    }
  }, [eventId]);


  useEffect(() => {
    void load();
  }, [load]);

  const uploads = rows.filter((r) => r.source === "upload");
  const aiSongs = rows.filter((r) => r.source === "ai");
  /** At the cap, every compose button is off, so the UI has to say so out loud. */
  const atAiCap = aiSongs.length >= MAX_AI_TRACKS;

  const links = rows.filter((r) => r.source === "link");

  async function addUpload(file: File | undefined) {
    if (!file) return;
    if (!licence) {
      toast.error("Tick the licence confirmation first.");
      return;
    }
    setBusy("upload");
    try {
      const analysis = await analyseAudioFile(file);
      if (analysis.seconds > MAX_MUSIC_SECONDS) {
        throw new Error("Each track must be 5 minutes or shorter.");
      }
      const dataBase64 = await fileToBase64(file);
      await uploadWallMusic({
        data: {
          eventId,
          title: file.name.replace(/\.[^.]+$/, "").slice(0, 120),
          contentType: file.type || "audio/mpeg",
          durationSeconds: analysis.seconds || 1,
          licenceAffirmed: true,
          dataBase64,
          bpm: analysis.bpm,
          energy: analysis.energy,
        },
      });
      setLicence(false);
      await load();
      toast.success("Track added.");
    } catch (e) {
      toast.error(errMsg(e, "Couldn't add that track"));
    } finally {
      setBusy(null);
    }
  }

  async function addLink() {
    if (!linkUrl.trim()) return;
    // He built this product and still expected a pasted Apple Music link to play
    // under the photos. Say what this actually does before it is saved, not in a
    // help page afterwards.
    if (
      !(await confirmDialog({
        title: "This is a separate player, not the soundtrack",
        body: "The wall shows the official Spotify, Apple Music or Amazon Music player. Someone has to press play on it, and starting it stops your own songs, because these services never allow their music to be blended with, or timed to, the photos. Anyone not signed in to that service hears 30 second previews. For sound that runs under the photos all night, upload music you own or compose something original.",
        confirmLabel: "I understand, add the player",
      }))
    )
      return;
    setBusy("link");
    try {
      await addWallMusicLink({ data: { eventId, url: linkUrl.trim() } });
      setLinkUrl("");
      await load();
      toast.success("Playlist player added. It plays on its own, separate from your songs.");
    } catch (e) {
      toast.error(errMsg(e, "Couldn't add that link"));
    } finally {
      setBusy(null);
    }
  }


  /**
   * Short taste. Nothing is uploaded, so it costs a fraction of a song, but it is
   * kept on this device with the exact prompt behind it so a refresh never loses
   * a take the host liked and any sample can become a full song later.
   */
  async function takeSample(seconds: SampleLength) {
    setSampling(seconds);
    try {
      const res = await sampleWallSong({ data: { eventId, ...song, seconds } });
      const bytes = Uint8Array.from(atob(res.audioBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: res.contentType });
      const url = URL.createObjectURL(blob);
      setSample({
        url,
        prompt: res.prompt,
        used: res.samplesUsed,
        left: res.samplesLeft,
        seconds: res.seconds,
      });
      setJustAdded(null);
      await saveSample({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        eventId,
        createdAt: Date.now(),
        seconds: res.seconds,
        prompt: res.prompt,
        settings: { ...song },
        title: songTitle.trim(),
        artist: songArtist.trim(),
        contentType: res.contentType,
        audio: blob,
      });
      await refreshShelf(eventId);
      toast.success(`Here's your ${songLengthLabel(res.seconds)} sample. It's saved on this device.`);
    } catch (e) {
      toast.error(errMsg(e, "Couldn't make a sample"));
    } finally {
      setSampling(null);
    }
  }

  /** Puts a saved sample's words and choices back into the form. */
  function restoreSample(s: ShelfSample) {
    const saved = s.settings as Partial<SongSettings>;
    setSong((prev) => ({ ...prev, ...saved }));
    if (s.title) setSongTitle(s.title);
    if (s.artist) setSongArtist(s.artist);
    toast.success("Those settings are back in the form. Adjust anything you like.");
  }

  /** Compose a full-length piece from a saved sample, using its exact words. */
  async function composeFromSample(s: ShelfSample, seconds: AiSongLength) {
    const saved = s.settings as Partial<SongSettings>;
    setSong((prev) => ({ ...prev, ...saved }));
    setSongSeconds(seconds);
    if (s.title) setSongTitle(s.title);
    if (s.artist) setSongArtist(s.artist);
    await compose(false, {
      prompt: s.prompt,
      settings: { ...song, ...saved },
      seconds,
      title: s.title,
      artist: s.artist,
    });
  }

  /** Take a sample off the shelf. */
  async function forgetSample(s: ShelfSample) {
    await removeSample(s.id);
    await refreshShelf(eventId);
  }


  /**
   * Words only, no audio. "brief" rewrites the host's notes into a stronger
   * description; "poem" writes the verse itself. Both are free to run, so a host
   * can get the words right before spending anything on a performance.
   */
  async function draftWords(want: "brief" | "poem") {
    setWriting(want);
    try {
      const res = await draftWallSongWords({
        data: {
          eventId,
          want,
          words: song.words,
          genre: song.genre,
          mood: song.mood,
          poemStyle: song.poemStyle,
          seconds: songSeconds,
        },
      });
      if (want === "poem") {
        setSong((prev) => ({ ...prev, kind: "poem", poemText: res.text }));
        toast.success("Here's a draft. Edit any line, then sample it.");
      } else {
        setWordsBefore(song.words);
        setSong((prev) => ({ ...prev, words: res.text.slice(0, 400) }));
        toast.success("Description strengthened. You can still edit it.");
      }
    } catch (e) {
      toast.error(errMsg(e, "Couldn't write that"));
    } finally {
      setWriting(null);
    }
  }


  /**
   * Composes the full-length piece. `from` lets a saved sample drive it, so the
   * song is made from the very words that produced the take the host liked
   * instead of whatever happens to be typed in the form at that moment.
   */
  async function compose(
    useSamplePrompt = false,
    from?: {
      prompt: string;
      settings: SongSettings;
      seconds: AiSongLength;
      title: string;
      artist: string;
    },
  ) {
    setComposing(true);
    try {
      const title = (from?.title ?? songTitle).trim();
      const artist = (from?.artist ?? songArtist).trim();
      await generateWallSong({
        data: {
          eventId,
          ...(from?.settings ?? song),
          seconds: from?.seconds ?? songSeconds,

          ...(title ? { title } : {}),
          ...(artist ? { artist } : {}),
          ...(from ? { prompt: from.prompt } : useSamplePrompt && sample ? { prompt: sample.prompt } : {}),
        },
      });
      const wanted = title;
      setSongTitle("");
      setSongArtist("");
      setSample(null);

      const next = await load();
      const known = new Set(rows.map((r) => r.id));
      const fresh =
        next.find((r) => r.source === "ai" && !known.has(r.id)) ??
        next.find((r) => r.source === "ai" && wanted && r.title === wanted) ??
        null;
      setJustAdded(fresh);
      toast.success("Your song is ready. It's saved in your soundtrack list.");

    } catch (e) {
      toast.error(errMsg(e, "Couldn't compose that song"));
    } finally {
      setComposing(false);
    }
  }

  /** Re-compose an AI song in place, keeping its name and settings. */
  async function regenerate(row: Row) {
    if (
      !(await confirmDialog({
        title: `Recompose "${row.title}"?`,
        body: "A fresh take is composed with the same settings and name. It replaces the current audio once it's ready, and the invitation, if attached, keeps working.",
        confirmLabel: "Yes, recompose it",
      }))
    )
      return;
    setBusy(`regen:${row.id}`);
    try {
      await regenerateWallSong({ data: { eventId, trackId: row.id } });
      await load();
      toast.success(`"${row.title}" was recomposed.`);
    } catch (e) {
      toast.error(errMsg(e, "Couldn't recompose that song"));
    } finally {
      setBusy(null);
    }
  }

  async function openReuse() {
    setReuseOpen(true);
    setBusy("reuse");
    try {
      setReusable(await listReusableAiSongs({ data: { excludeEventId: eventId } }));
    } catch (e) {
      toast.error(errMsg(e, "Couldn't load your other songs"));
      setReusable([]);
    } finally {
      setBusy(null);
    }
  }

  async function reuseSong(song: ReusableSong) {
    setBusy(`reuse:${song.trackId}`);
    try {
      await copyWallSongToEvent({ data: { trackId: song.trackId, targetEventId: eventId } });
      setReuseOpen(false);
      await load();
      toast.success(`"${song.title}" is now on this event.`);
    } catch (e) {
      toast.error(errMsg(e, "Couldn't reuse that song"));
    } finally {
      setBusy(null);
    }
  }

  /** True when this track is the one currently playing on the invitation. */
  function isInvitationSong(row: Row): boolean {
    return !!row.url && !!kevent?.songUrl && kevent.songUrl === row.url;
  }

  async function saveRename(row: Row) {
    const title = editTitle.trim();
    setEditingId(null);
    if (!title || title === row.title) return;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, title } : r)));
    try {
      await renameWallMusic({ data: { eventId, trackId: row.id, title } });
      // The invitation card carries its own copy of the name, so keep the two
      // in step when the attached track is renamed.
      if (isInvitationSong(row)) updateEvent(eventId, { songTitle: title.slice(0, 80) });
      toast.success("Name saved.");
    } catch (e) {
      toast.error(errMsg(e, "Couldn't rename that track"));
      await load();
    }
  }

  /** Puts this track on the invitation, carrying its name and credit across. */
  function useOnInvitation(row: Row) {
    if (!row.url) return;
    updateEvent(eventId, {
      songUrl: row.url,
      songTitle: row.title.slice(0, 80),
      songArtist: row.artist?.slice(0, 80) ?? "",
      songAllowDownload: true,
    });
    toast.success(`"${row.title}" is now the invitation song.`);
  }

  async function remove(row: Row) {
    const onInvite = isInvitationSong(row);
    if (
      !(await confirmDialog({
        title: `Remove "${row.title}"?`,
        body:
          row.source === "link"
            ? "The playlist card comes off the wall. Your playlist itself is untouched."
            : onInvite
              ? "The audio file is deleted for good, and it will also come off your invitation, so guests won't see a song there."
              : "The audio file is deleted for good.",
        confirmLabel: "Yes, remove it",
      }))
    )
      return;
    setBusy(row.id);
    try {
      await deleteWallMusic({ data: { eventId, trackId: row.id } });
      // The invitation stores the track's file address, so leaving it behind
      // would show guests a broken song. Clear it in the same action.
      if (onInvite) {
        updateEvent(eventId, {
          songUrl: "",
          songTitle: "",
          songArtist: "",
          songAllowDownload: false,
        });
        toast("That song has been taken off your invitation too.");
      }
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Couldn't remove that"));
    } finally {
      setBusy(null);
    }
  }

  async function move(index: number, delta: number) {
    const next = [...rows];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row!);
    setRows(next);
    try {
      await reorderWallMusic({ data: { eventId, trackIds: next.map((r) => r.id) } });
    } catch (e) {
      toast.error(errMsg(e, "Couldn't save that order"));
      await load();
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-ink/10 bg-secondary/30 p-4">
      <p className="text-sm font-medium text-ink">Soundtrack</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Music plays only after someone taps start, then loops for as long as the wall runs, blending
        one track into the next. Photos change on the beat when we can read the tempo. Silence at the
        start and end of a file is skipped, and every track is levelled so one song never jumps out
        louder than the rest.
      </p>

      {links.length > 0 && uploads.length + aiSongs.length === 0 && (
        <p
          role="status"
          className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-ink"
        >
          Nothing plays under the photos. A streaming playlist is a separate player someone has to
          press play on, and it can't be timed to the photos. Upload music you own or compose
          something original below.
        </p>
      )}

      {/* Deliberately the first control in this section: the person reaching for
          it is standing in a venue with guests arriving, and the music is already
          playing from a speaker in the room. */}
      <label
        className={`mt-3 flex items-start gap-3 rounded-xl border px-3 py-3 text-sm ${
          kevent?.wallSilent
            ? "border-velvet/40 bg-velvet/10"
            : "border-ink/15 bg-card"
        }`}
      >
        <input
          type="checkbox"
          checked={!!kevent?.wallSilent}
          onChange={(e) => updateEvent(eventId, { wallSilent: e.target.checked })}
          className="mt-0.5 h-5 w-5 accent-primary"
        />
        <span>
          <span className="font-medium text-ink">Run this wall without sound</span>
          <span className="block text-xs text-muted-foreground">
            For when the music comes from the room, a phone into a speaker or the venue system,
            while the screen shows photos. Your songs stay saved on this event, nothing is deleted,
            and you can turn sound back on at any time.
          </span>
          {kevent?.wallSilent && (
            <span className="mt-1 block text-xs font-medium text-velvet">
              The wall is silent tonight. Songs are kept.
            </span>
          )}
        </span>
      </label>


      <label className="mt-3 flex items-start gap-2 rounded-lg bg-card px-3 py-2 text-xs text-ink">
        <input
          type="checkbox"
          checked={!!kevent?.wallNoCrossfade}
          onChange={(e) => updateEvent(eventId, { wallNoCrossfade: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        <span>
          Play songs one at a time, with a clean gap
          <span className="block text-muted-foreground">
            No blending between tracks. Best for a ceremony, where two songs overlapping would be
            wrong.
          </span>
        </span>
      </label>


      {rows.length > 0 && (
        <ul ref={listRef} className="mt-3 space-y-1">
          {rows.map((row, index) => (
            <li
              key={row.id}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${
                justAdded?.id === row.id
                  ? "bg-card ring-2 ring-primary"
                  : "bg-card"
              }`}
            >

              <span className="flex flex-col leading-tight">
                <button
                  type="button"
                  aria-label={`Move ${row.title} up`}
                  disabled={index === 0}
                  onClick={() => void move(index, -1)}
                  className="text-ink/50 hover:text-ink disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Move ${row.title} down`}
                  disabled={index === rows.length - 1}
                  onClick={() => void move(index, 1)}
                  className="text-ink/50 hover:text-ink disabled:opacity-30"
                >
                  ▼
                </button>
              </span>
              {editingId === row.id ? (
                <input
                  autoFocus
                  value={editTitle}
                  aria-label={`Name for ${row.title}`}
                  maxLength={120}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => void saveRename(row)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveRename(row);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="min-w-0 flex-1 rounded-md border border-ink/15 bg-card px-2 py-1 text-xs"
                />
              ) : (
              <span className="min-w-0 flex-1 truncate">
                <span
                  className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    row.source === "link"
                      ? "bg-ink/10 text-ink/60"
                      : "bg-primary/15 text-primary"
                  }`}
                >
                  {row.source === "link" ? "Separate player, not the soundtrack" : "Plays on the wall"}
                </span>
                {row.title}
                <span className="ml-2 text-ink/45">
                  {row.source === "ai"
                    ? `AI song${row.seconds ? ` · ${mmss(row.seconds)}` : ""}`
                    : row.source === "link"
                      ? `Opens in ${LINK_PROVIDER_LABELS[(row.link?.provider ?? "spotify") as LinkProvider]}`
                      : mmss(row.seconds)}
                  {row.bpm ? ` · ${row.bpm} BPM` : ""}
                </span>
                {row.artist && <span className="block truncate text-[11px] text-ink/50">{row.artist}</span>}
              </span>
              )}

              <button
                type="button"
                aria-label={`Rename ${row.title}`}
                onClick={() => {
                  setEditingId(row.id);
                  setEditTitle(row.title);
                }}
                className="text-ink/60 hover:text-ink"
              >
                Rename
              </button>
              {row.source === "ai" && (
                <button
                  type="button"
                  disabled={busy === `regen:${row.id}`}
                  aria-label={`Recompose ${row.title}`}
                  onClick={() => void regenerate(row)}
                  className="text-ink/60 hover:text-ink disabled:opacity-50"
                >
                  {busy === `regen:${row.id}` ? "Recomposing…" : "Recompose"}
                </button>
              )}
              {row.url && (
                <button
                  type="button"
                  onClick={() => useOnInvitation(row)}
                  className="text-ink/60 hover:text-ink"
                >
                  Use on invitation
                </button>
              )}
              {row.url && <audio src={row.url} controls preload="none" className="h-7 w-40" />}
              <button
                type="button"
                disabled={busy === row.id}
                aria-label={`Remove ${row.title}`}
                onClick={() => void remove(row)}
                className="text-destructive hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Uploads */}
      <div className="mt-4 border-t border-ink/10 pt-3">
        <p className="text-xs font-medium text-ink">
          Your own music ({uploads.length}/{MAX_UPLOAD_TRACKS})
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          This is the way to use a song you already have. Uploaded tracks really do play under the
          photos, as long as you own the recording or have permission to play it.
        </p>

        <label className="mt-2 flex items-start gap-2 text-xs text-ink/70">
          <input
            type="checkbox"
            checked={licence}
            onChange={(e) => setLicence(e.target.checked)}
            className="mt-0.5"
          />
          <span>{MUSIC_LICENCE_TEXT}</span>
        </label>
        <input
          type="file"
          accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav,.mp3,.m4a,.ogg,.wav"
          disabled={!licence || busy === "upload" || uploads.length >= MAX_UPLOAD_TRACKS}
          onChange={(e) => void addUpload(e.target.files?.[0])}
          className="mt-2 block w-full text-xs disabled:opacity-50"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {busy === "upload"
            ? "Adding your track… stay on this page, it only takes a moment."
            : "MP3, M4A, WAV or OGG. Up to 5 minutes and 10MB each."}
        </p>
      </div>

      {/* Streaming link */}
      <div className="mt-4 border-t border-ink/10 pt-3">
        <p className="text-xs font-medium text-ink">
          Streaming playlist{" "}
          <span className="font-normal text-ink/50">(a separate player, not the soundtrack)</span>
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Paste a Spotify, Apple Music or Amazon Music link and the wall shows that service's own
          player, so guests can press play right there or open it in their app. It runs on its own:
          starting it stops your songs, and it can't be timed to the photos, because none of these
          services allow that. Listeners who aren't signed in hear 30 second previews. For sound
          under the photos, upload music you own or compose something original below.
        </p>

        <div className="mt-2 flex gap-2">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://open.spotify.com/playlist/..."
            aria-label="Playlist link"
            className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-card px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={() => void addLink()}
            disabled={busy === "link" || links.length >= 1 || !linkUrl.trim()}
            className="rounded-lg border border-ink/15 bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
          >
            {busy === "link" ? "Adding…" : "Add card"}
          </button>
        </div>
      </div>

      {/* AI song or poem */}
      <div className="mt-4 border-t border-ink/10 pt-3">
        <p className="text-xs font-medium text-ink">
          Create something original ({aiSongs.length}/{MAX_AI_TRACKS})
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          A sung song for the room, a poem read aloud over music, or a letter in someone's own
          words for the moment everyone goes quiet. Songs and poems loop under the photos. A
          letter is read once, when someone presses play.
        </p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="What to create">
          <button
            type="button"
            onClick={() => setLetterMode(true)}
            aria-pressed={letterMode}
            className={`min-h-11 rounded-lg border px-3 py-1.5 text-xs font-medium ${
              letterMode
                ? "border-ink bg-ink text-paper"
                : "border-ink/25 bg-card hover:bg-secondary"
            }`}
          >
            A letter read aloud
          </button>
          {(
            [
              ["song", "A song they can sing along to"],
              ["poem", "A poem read aloud over music"],
            ] as [PieceKind, string][]
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                setLetterMode(false);
                setSong((prev) => ({
                  ...prev,
                  kind,
                  voice:
                    kind === "poem" && prev.voice === "instrumental"
                      ? "warm woman's voice"
                      : kind === "song" && POEM_VOICES.includes(prev.voice as never)
                        ? "female lead"
                        : prev.voice,
                }));
              }}
              aria-pressed={!letterMode && song.kind === kind}
              className={`min-h-11 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                !letterMode && song.kind === kind
                  ? "border-ink bg-ink text-paper"
                  : "border-ink/25 bg-card hover:bg-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {letterMode ? (
          <div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              A letter is written and read aloud in Kenroe Sound Studio, where you read and
              approve every word before a voice records it. Place a finished one here.
            </p>
            <WallPieceLibrary eventId={eventId} kind="letter" onAttached={() => void load()} />
          </div>
        ) : (
          <>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            type="text"
            value={songTitle}
            onChange={(e) => setSongTitle(e.target.value.slice(0, 120))}
            placeholder={song.kind === "poem" ? "Poem name (optional)" : "Song name (optional)"}
            aria-label="Song name"
            className="w-full rounded-lg border border-ink/15 bg-card px-2 py-1.5 text-xs"
          />
          <input
            type="text"
            value={songArtist}
            onChange={(e) => setSongArtist(e.target.value.slice(0, 120))}
            placeholder="Credit line (optional), e.g. Composed for Tenia"
            aria-label="Credit line"
            className="w-full rounded-lg border border-ink/15 bg-card px-2 py-1.5 text-xs"
          />
        </div>
        <textarea
          value={song.words}
          onChange={(e) => setSong({ ...song, words: e.target.value })}
          rows={3}
          maxLength={400}
          placeholder="Who is it for, what you love about them, and where it plays. Example: for my grandmother Tenia, 80 years old, raised six children in Georgia, plays as her photos come up."
          aria-label="Song description"
          className="mt-2 w-full rounded-lg border border-ink/15 bg-card px-2 py-1.5 text-xs"
        />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void draftWords("brief")}
            disabled={writing !== null || song.words.trim().length < 3}
            className="min-h-11 rounded-lg border border-ink/25 bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
          >
            {writing === "brief" ? "Writing…" : "Make my description stronger"}
          </button>
          {wordsBefore !== null && (
            <button
              type="button"
              onClick={() => {
                setSong((prev) => ({ ...prev, words: wordsBefore }));
                setWordsBefore(null);
              }}
              className="min-h-11 rounded-lg border border-ink/15 bg-card px-3 py-1.5 text-xs hover:bg-secondary"
            >
              Undo, put mine back
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            "names of the people it honours",
            "the city or country it comes from",
            "one memory everyone tells",
            "a phrase they always say",
            "the moment it plays, like the first dance",
          ].map((hint) => (
            <span
              key={hint}
              className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-ink/70"
            >
              {hint}
            </span>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Mention those and it stops sounding generic. If a name comes out wrong, spell it the way it
          sounds, like Ken-row for Kenroe, then take another sample.
        </p>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-[11px] text-ink/70">
            {song.kind === "poem" ? "Music underneath" : "Genre"}
            <select
              value={song.genre}
              onChange={(e) => setSong({ ...song, genre: e.target.value })}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-card px-2 py-1.5 text-xs"
            >
              {GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-ink/70">
            Mood
            <select
              value={song.mood}
              onChange={(e) => setSong({ ...song, mood: e.target.value })}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-card px-2 py-1.5 text-xs"
            >
              {MOODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-ink/70">
            {song.kind === "poem" ? "Read by" : "Voice"}
            <select
              value={song.voice}
              onChange={(e) => setSong({ ...song, voice: e.target.value })}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-card px-2 py-1.5 text-xs"
            >
              {voiceOptions(song.kind === "poem" ? POEM_VOICES : VOICES, song.voice).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        {song.kind === "poem" && (
          <div className="mt-2 rounded-lg border border-ink/10 bg-secondary/30 p-2">
            <label className="text-[11px] text-ink/70">
              Kind of poem
              <select
                value={song.poemStyle}
                onChange={(e) => setSong({ ...song, poemStyle: e.target.value })}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-card px-2 py-1.5 text-xs"
              >
                {POEM_STYLES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {POEM_STYLE_HINTS[song.poemStyle] ?? "Read aloud over the music."}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void draftWords("poem")}
                disabled={writing !== null}
                className="min-h-11 rounded-lg border border-ink/25 bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
              >
                {writing === "poem"
                  ? "Writing…"
                  : song.poemText.trim()
                    ? "Write me another version"
                    : "Write the poem for me"}
              </button>
              <span className="text-[11px] text-muted-foreground">
                Free, no audio is made. About {poemWordBudget(songSeconds)} words for{" "}
                {songLengthLabel(songSeconds)}.
              </span>
            </div>
            <textarea
              value={song.poemText}
              onChange={(e) => setSong({ ...song, poemText: e.target.value.slice(0, 1200) })}
              rows={6}
              placeholder="Write or paste the words to be read aloud. Leave this empty and the reader improvises from your description."
              aria-label="Poem words"
              className="mt-2 w-full rounded-lg border border-ink/15 bg-card px-2 py-1.5 text-xs leading-relaxed"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              These exact words get read, so edit any line until it sounds like you.{" "}
              {song.poemText.trim()
                ? `${song.poemText.trim().split(/\s+/).length} words so far.`
                : ""}
            </p>
          </div>
        )}

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(
            [
              ["tempo", "Slow", "Fast"],
              ["bass", "Light bass", "Heavy bass"],
              ["brightness", "Warm", "Bright"],
            ] as const
          ).map(([key, low, high]) => (
            <label key={key} className="text-[11px] text-ink/70">
              <span className="flex justify-between">
                <span>{low}</span>
                <span>{high}</span>
              </span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={song[key]}
                aria-label={`${key} level`}
                onChange={(e) => setSong({ ...song, [key]: Number(e.target.value) })}
                className="mt-1 w-full"
              />
            </label>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-ink/10 bg-secondary/40 p-2">
          <p className="text-[11px] font-medium text-ink">Step 1: hear a sample first</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            A sample costs a fraction of a song. Start at 10 seconds, then go longer once the feel is
            right. Every sample is kept on this device, so you can close this page and come back to
            turn one into a full song.
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {SAMPLE_LENGTH_CHOICES.map((secs) => (
              <button
                key={secs}
                type="button"
                onClick={() => void takeSample(secs)}
                disabled={sampling !== null || composing}
                className="min-h-11 rounded-lg border border-ink/25 bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
              >
                {sampling === secs ? "Making it…" : `Sample ${secs} seconds`}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 rounded-lg border border-ink/10 bg-secondary/40 p-2">
          <p className="text-[11px] font-medium text-ink">Step 2: choose the length, then compose</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {AI_SONG_LENGTH_CHOICES.map((secs) => (
              <button
                key={secs}
                type="button"
                onClick={() => setSongSeconds(secs)}
                aria-pressed={songSeconds === secs}
                className={`min-h-11 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  songSeconds === secs
                    ? "border-ink bg-ink text-paper"
                    : "border-ink/25 bg-card hover:bg-secondary"
                }`}
              >
                {songLengthLabel(secs)}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            A one minute song loops seamlessly under a long slideshow. Pick 3 or 4 minutes when you
            want the song itself to be the moment, like a first dance or a tribute. Longer songs take
            longer to come back, so stay on this page while it works.
          </p>
          {atAiCap && (
            <p className="mt-2 rounded-lg border border-ink/20 bg-card p-2 text-[11px] text-ink">
              Composing is switched off because this event already has {MAX_AI_TRACKS} AI pieces, the
              most we keep per event. Remove one from the list above and you can compose again.
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">

            <button
              type="button"
              onClick={() => void compose()}
              disabled={composing || sampling !== null || aiSongs.length >= MAX_AI_TRACKS}
              className="min-h-11 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50"
            >
              {composing
                ? `Composing… ${composeWaitLabel(songSeconds)}`
                : `Compose the ${songLengthLabel(songSeconds)} song`}
            </button>
            <button
              type="button"
              onClick={() => (reuseOpen ? setReuseOpen(false) : void openReuse())}
              disabled={busy === "reuse" || aiSongs.length >= MAX_AI_TRACKS}
              className="min-h-11 rounded-lg border border-ink/15 bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
            >
              {busy === "reuse" ? "Loading…" : "Reuse a song I already made"}
            </button>
          </div>
        </div>

        {justAdded && (
          <div className="mt-2 rounded-lg border border-primary/40 bg-card p-2">
            <p className="text-[11px] font-medium text-ink">
              Saved: {justAdded.title}
              {justAdded.seconds ? ` · ${mmss(justAdded.seconds)}` : ""}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              It's in your soundtrack list at the top of this panel, and it will play under the
              photos.
            </p>
            {justAdded.url && (
              <audio
                src={justAdded.url}
                controls
                preload="none"
                aria-label={`Play ${justAdded.title}`}
                className="mt-2 w-full"
              />
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  listRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
                className="rounded-lg border border-ink/15 bg-card px-3 py-1.5 text-[11px] hover:bg-secondary"
              >
                Show it in my list
              </button>
              <button
                type="button"
                onClick={() => setJustAdded(null)}
                className="rounded-lg border border-ink/15 bg-card px-3 py-1.5 text-[11px] hover:bg-secondary"
              >
                Got it
              </button>
            </div>
          </div>
        )}

        {sample && (
          <div className="mt-2 rounded-lg border border-ink/15 bg-card p-2">
            <p className="text-[11px] font-medium text-ink">
              {songLengthLabel(sample.seconds)} sample · {sample.left} left this hour
              {songTitle.trim() ? ` · will be saved as "${songTitle.trim()}"` : ""}
            </p>
            <audio
              src={sample.url}
              controls
              preload="auto"
              aria-label="Song sample"
              className="mt-2 w-full"
            />
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-muted-foreground">
                What the composer was told
              </summary>
              <p className="mt-1 text-[11px] text-ink/70">{sample.prompt}</p>
            </details>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void compose(true)}
                disabled={composing || sampling !== null || aiSongs.length >= MAX_AI_TRACKS}
                className="min-h-11 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50"
              >
                {composing
                  ? `Composing… ${composeWaitLabel(songSeconds)}`
                  : `Compose the ${songLengthLabel(songSeconds)} song from this sample`}
              </button>
              {SAMPLE_LENGTH_CHOICES.filter((s) => s !== sample.seconds).map((secs) => (
                <button
                  key={secs}
                  type="button"
                  onClick={() => void takeSample(secs)}
                  disabled={sampling !== null || composing || sample.left <= 0}
                  className="min-h-11 rounded-lg border border-ink/15 bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
                >
                  {sampling === secs ? "Making it…" : `Hear ${secs} seconds`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => void takeSample(sample.seconds as SampleLength)}
                disabled={sampling !== null || composing || sample.left <= 0}
                className="min-h-11 rounded-lg border border-ink/15 bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
              >
                Try another take
              </button>

              <button
                type="button"
                onClick={() => setSample(null)}
                className="rounded-lg border border-ink/15 bg-card px-3 py-1.5 text-xs hover:bg-secondary"
              >
                Hide this player
              </button>
            </div>
          </div>
        )}

        {shelf.length > 0 && (
          <div className="mt-3 rounded-lg border border-ink/10 bg-card p-2">
            <p className="text-[11px] font-medium text-ink">
              Samples you've made ({shelf.length} of {SHELF_LIMIT} kept)
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              These stay here after a refresh, on this device only. Pick one and we'll compose the
              full-length version from the very same words, so it sounds like the take you liked.
            </p>
            <ul className="mt-2 space-y-2">
              {shelf.map((s) => (
                <li key={s.id} className="rounded-lg border border-ink/10 bg-secondary/30 p-2">
                  <p className="text-[11px] font-medium text-ink">
                    {s.title ||
                      ((s.settings as Partial<SongSettings>).kind === "poem"
                        ? "Untitled poem"
                        : "Untitled sample")}{" "}
                    · {songLengthLabel(s.seconds)} · {sampleAgeLabel(s.createdAt)}
                  </p>

                  {shelfUrls[s.id] ? (
                    <audio
                      src={shelfUrls[s.id]}
                      controls
                      preload="none"
                      aria-label={`Play saved sample from ${sampleAgeLabel(s.createdAt)}`}
                      className="mt-1.5 w-full"
                    />
                  ) : (
                    <p className="mt-1.5 text-[11px] text-amber-700">
                      The audio for this sample is no longer on this device, so there is nothing to
                      play. Your settings are still here, so you can compose it again below.
                    </p>
                  )}

                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-[11px] text-muted-foreground">
                      What the composer was told
                    </summary>
                    <p className="mt-1 text-[11px] text-ink/70">{s.prompt}</p>
                  </details>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {AI_SONG_LENGTH_CHOICES.map((secs) => (
                      <button
                        key={secs}
                        type="button"
                        onClick={() => void composeFromSample(s, secs)}
                        disabled={
                          composing || sampling !== null || aiSongs.length >= MAX_AI_TRACKS
                        }
                        className="min-h-11 rounded-lg bg-ink px-3 py-1.5 text-[11px] font-medium text-paper hover:opacity-90 disabled:opacity-50"
                      >
                        {composing
                          ? `Composing… ${composeWaitLabel(secs)}`
                          : `Make it a ${songLengthLabel(secs)} song`}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => restoreSample(s)}
                      disabled={composing || sampling !== null}
                      className="min-h-11 rounded-lg border border-ink/15 bg-card px-3 py-1.5 text-[11px] hover:bg-secondary disabled:opacity-50"
                    >
                      Load these settings
                    </button>
                    <button
                      type="button"
                      onClick={() => void forgetSample(s)}
                      disabled={composing}
                      className="min-h-11 rounded-lg border border-ink/15 bg-card px-3 py-1.5 text-[11px] hover:bg-secondary disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {reuseOpen && (
          <div className="mt-2 rounded-lg border border-ink/10 bg-card p-2">
            <p className="text-[11px] text-muted-foreground">
              Songs you composed for other events. Reusing one copies the audio across, with no new
              generation cost.
            </p>
            {reusable === null ? (
              <p className="mt-2 text-xs text-ink/60">Loading your songs…</p>
            ) : reusable.length === 0 ? (
              <p className="mt-2 text-xs text-ink/60">No songs to reuse yet.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {reusable.map((s) => (
                  <li
                    key={s.trackId}
                    className="flex items-center gap-2 rounded-md bg-secondary/40 px-2 py-1.5 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {s.title}
                      <span className="ml-2 text-ink/45">
                        {s.eventTitle}
                        {s.seconds ? ` · ${mmss(s.seconds)}` : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={busy === `reuse:${s.trackId}`}
                      onClick={() => void reuseSong(s)}
                      className="text-ink/60 hover:text-ink disabled:opacity-50"
                    >
                      {busy === `reuse:${s.trackId}` ? "Copying…" : "Use here"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
