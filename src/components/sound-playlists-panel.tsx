/**
 * Folders and playlists for the Sound Studio library.
 *
 * Accessibility comes first here: every reordering and filing action has a
 * plain button and menu path that works with a keyboard and a screen reader.
 * Drag and drop is an extra on top of that, never the only way in, because a
 * lot of the people using this product find dragging on a touchscreen hard.
 */
import { toUserMessage } from "@/lib/user-error";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Download,
  FolderPlus,
  GripVertical,
  Link2,
  ListMusic,
  Loader2,
  Trash2,
  X,
} from "lucide-react";

import {
  addPiecesToPlaylist,
  createPlaylist,
  deletePlaylist,
  listMyPlaylists,
  movePieceInPlaylist,
  removePieceFromPlaylist,
  setPlaylistOrder,
  updatePlaylist,
} from "@/lib/sound-playlists.functions";
import { useQuery } from "@tanstack/react-query";
import { WallMusicPlayer } from "@/components/wall-music-player";
import { songLengthLabel } from "@/lib/wall-soundtrack";
import { playlistShareUrl, playlistZipUrl } from "@/lib/sound-share";
import { useEvents } from "@/lib/events-store";

type Item = {
  itemId: string;
  position: number;
  id: string;
  title: string;
  kind: string;
  seconds: number;
  bpm: number | null;
  energy: number | null;
  url: string | null;
};

type Playlist = {
  id: string;
  name: string;
  description: string | null;
  eventId: string | null;
  shareToken: string;
  shareSlug: string | null;
  shareKey: string;
  createdAt: string;
  items: Item[];
};

export function useMyPlaylists() {
  return useQuery({
    queryKey: ["sound-playlists"],
    queryFn: async () =>
      (await listMyPlaylists()) as unknown as { playlists: Playlist[] },
  });
}

/** The "Add to folder" menu shown on each piece in the library. */
export function AddToPlaylistMenu({
  pieceId,
  playlists,
  onChanged,
}: {
  pieceId: string;
  playlists: Playlist[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");

  async function addTo(playlistId: string) {
    setBusy(true);
    try {
      const res = (await addPiecesToPlaylist({
        data: { playlistId, pieceIds: [pieceId] },
      } as never)) as { added: number };
      toast.success(res.added ? "Added to that folder" : "It was already in that folder");
      setOpen(false);
      onChanged();
    } catch (e) {
      toast.error(toUserMessage(e, "Couldn't add that piece."));
    } finally {
      setBusy(false);
    }
  }

  async function makeAndAdd() {
    const name = newName.trim();
    if (!name) {
      toast.error("Give the folder a name first.");
      return;
    }
    setBusy(true);
    try {
      const made = (await createPlaylist({ data: { name } } as never)) as { id: string };
      await addPiecesToPlaylist({
        data: { playlistId: made.id, pieceIds: [pieceId] },
      } as never);
      setNewName("");
      setOpen(false);
      onChanged();
      toast.success(`Added to "${name}"`);
    } catch {
      toast.error("Couldn't make that folder.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-ink/70 ring-1 ring-ink/15 hover:bg-ink/5"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <FolderPlus className="h-4 w-4" aria-hidden />
        )}
        Move to folder
      </button>
      {open ? (
        <div className="mt-2 w-full rounded-2xl border border-ink/10 bg-white p-3">
          <p className="text-xs text-ink/55">Choose a folder, or make a new one.</p>
          {playlists.length ? (
            <ul className="mt-2 space-y-1">
              {playlists.map((pl) => (
                <li key={pl.id}>
                  <button
                    type="button"
                    onClick={() => void addTo(pl.id)}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-ink/5"
                  >
                    {pl.name}{" "}
                    <span className="text-ink/45">
                      ({pl.items.length} {pl.items.length === 1 ? "piece" : "pieces"})
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="flex-1">
              <span className="sr-only">New folder name</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New folder name"
                className="min-h-[40px] w-full rounded-xl border border-ink/15 px-3 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void makeAndAdd()}
              className="min-h-[40px] rounded-full bg-blossom px-4 text-sm font-medium text-white"
            >
              Make and add
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function SoundPlaylistsPanel({
  playlists,
  onChanged,
}: {
  playlists: Playlist[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    const clean = name.trim();
    if (!clean) {
      toast.error("Give the folder a name first.");
      return;
    }
    setBusy(true);
    try {
      await createPlaylist({ data: { name: clean } } as never);
      setName("");
      onChanged();
      toast.success("Folder created");
    } catch {
      toast.error("Couldn't create that folder.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink/50">
        <ListMusic className="h-3.5 w-3.5" aria-hidden /> Your folders ({playlists.length})
      </h2>
      <p className="mt-2 text-sm text-ink/60">
        A folder holds the pieces you choose, in the order you choose, and can be shared as one
        private link. A piece can sit in as many folders as you like, and taking it out of a folder
        never deletes it.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <label className="flex-1 min-w-[200px]">
          <span className="sr-only">New folder name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name a new folder, for example Bonfire night"
            className="min-h-[44px] w-full rounded-xl border border-ink/15 px-3 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-blossom px-5 text-sm font-medium text-white disabled:opacity-60"
        >
          <FolderPlus className="h-4 w-4" aria-hidden /> New folder
        </button>
      </div>

      <ul className="mt-4 space-y-4">
        {playlists.map((pl) => (
          <PlaylistCard key={pl.id} playlist={pl} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  );
}

function PlaylistCard({
  playlist,
  onChanged,
}: {
  playlist: Playlist;
  onChanged: () => void;
}) {
  const events = useEvents();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(playlist.name);
  const [dragging, setDragging] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const tracks = useMemo(
    () =>
      playlist.items
        .filter((i) => i.url)
        .map((i) => ({
          id: i.id,
          title: i.title,
          artist: null,
          url: i.url as string,
          crossfadeMs: 2500,
          bpm: i.bpm,
          energy: i.energy,
        })),
    [playlist.items],
  );

  const shareUrl =
    typeof window === "undefined" ? "" : playlistShareUrl(window.location.origin, playlist.shareKey);

  async function move(pieceId: string, direction: "up" | "down") {
    try {
      await movePieceInPlaylist({
        data: { playlistId: playlist.id, pieceId, direction },
      } as never);
      onChanged();
    } catch {
      toast.error("Couldn't move that piece.");
    }
  }

  async function dropOn(targetPieceId: string) {
    const source = dragging;
    setDragging(null);
    if (!source || source === targetPieceId) return;
    const order = playlist.items.map((i) => i.id).filter((id) => id !== source);
    const at = order.indexOf(targetPieceId);
    order.splice(at < 0 ? order.length : at, 0, source);
    try {
      await setPlaylistOrder({ data: { playlistId: playlist.id, pieceIds: order } } as never);
      onChanged();
    } catch {
      toast.error("Couldn't save that order.");
    }
  }

  return (
    <li className="rounded-2xl border border-ink/10 bg-white p-4">
      {renaming ? (
        <div className="flex flex-wrap gap-2">
          <label className="flex-1">
            <span className="sr-only">Folder name</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[40px] w-full rounded-xl border border-ink/15 px-3 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={async () => {
              try {
                await updatePlaylist({
                  data: { id: playlist.id, name: draft.trim() || playlist.name },
                } as never);
                setRenaming(false);
                onChanged();
                toast.success("Renamed");
              } catch {
                toast.error("Couldn't rename that folder.");
              }
            }}
            className="min-h-[40px] rounded-full bg-blossom px-4 text-sm font-medium text-white"
          >
            Save name
          </button>
          <button
            type="button"
            onClick={() => setRenaming(false)}
            className="min-h-[40px] rounded-full px-4 text-sm text-ink/60 ring-1 ring-ink/15"
          >
            Cancel
          </button>
        </div>
      ) : (
        <h3 className="font-medium text-ink">
          {playlist.name}{" "}
          <span className="text-ink/50">
            · {playlist.items.length} {playlist.items.length === 1 ? "piece" : "pieces"}
          </span>
        </h3>
      )}

      {playlist.items.length ? (
        <ol className="mt-3 space-y-2">
          {playlist.items.map((item, i) => (
            <li
              key={item.itemId}
              draggable
              onDragStart={() => setDragging(item.id)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => void dropOn(item.id)}
              className={`flex flex-wrap items-center gap-2 rounded-xl border border-ink/10 px-3 py-2 ${
                dragging === item.id ? "opacity-50" : ""
              }`}
            >
              <GripVertical className="h-4 w-4 text-ink/25" aria-hidden />
              <span className="flex-1 text-sm text-ink">
                <span className="text-ink/40">{i + 1}.</span> {item.title}{" "}
                <span className="text-ink/50">· {songLengthLabel(item.seconds)}</span>
              </span>
              <button
                type="button"
                onClick={() => void move(item.id, "up")}
                disabled={i === 0}
                aria-label={`Move ${item.title} up`}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-ink/15 hover:bg-ink/5 disabled:opacity-40"
              >
                <ArrowUp className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => void move(item.id, "down")}
                disabled={i === playlist.items.length - 1}
                aria-label={`Move ${item.title} down`}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-ink/15 hover:bg-ink/5 disabled:opacity-40"
              >
                <ArrowDown className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await removePieceFromPlaylist({
                      data: { playlistId: playlist.id, pieceId: item.id },
                    } as never);
                    onChanged();
                    toast.success("Taken out of the folder. The piece is still in your library.");
                  } catch {
                    toast.error("Couldn't take that out.");
                  }
                }}
                aria-label={`Take ${item.title} out of ${playlist.name}`}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-ink/10 text-ink/50 hover:bg-ink/5"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-ink/55">
          Nothing in here yet. Use "Move to folder" on any piece in your library.
        </p>
      )}

      {tracks.length ? (
        playing ? (
          <div className="mt-3">
            <WallMusicPlayer tracks={tracks} compact />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-ink/70 ring-1 ring-ink/15 hover:bg-ink/5"
          >
            Play this folder
          </button>
        )
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(shareUrl);
              toast.success("Playlist link copied. It is private: only people you send it to can open it.");
            } catch {
              toast.error("Couldn't copy that link.");
            }
          }}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-blossom ring-1 ring-blossom/30 hover:bg-blossom/5"
        >
          <Link2 className="h-4 w-4" aria-hidden /> Copy playlist link
        </button>
        {playlist.items.length ? (
          <a
            href={typeof window === "undefined" ? "#" : playlistZipUrl(window.location.origin, playlist.shareKey)}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-ink/70 ring-1 ring-ink/15 hover:bg-ink/5"
          >
            <Download className="h-4 w-4" aria-hidden /> Download all
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setDraft(playlist.name);
            setRenaming(true);
          }}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-ink/70 ring-1 ring-ink/15 hover:bg-ink/5"
        >
          Rename
        </button>
        {events.length ? (
          <label className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-3 text-sm text-ink/70 ring-1 ring-ink/15">
            <span className="text-xs text-ink/55">Event</span>
            <select
              value={playlist.eventId ?? ""}
              onChange={async (e) => {
                try {
                  await updatePlaylist({
                    data: { id: playlist.id, eventId: e.target.value || null },
                  } as never);
                  onChanged();
                  toast.success(e.target.value ? "Linked to that event" : "Event link removed");
                } catch {
                  toast.error("Couldn't link that event.");
                }
              }}
              className="min-h-[36px] bg-transparent text-sm"
            >
              <option value="">Not linked</option>
              {events.slice(0, 40).map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title || "Untitled event"}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          onClick={async () => {
            if (
              !window.confirm(
                `Delete the folder "${playlist.name}"? The pieces inside it stay in your library.`,
              )
            )
              return;
            try {
              await deletePlaylist({ data: { id: playlist.id } } as never);
              onChanged();
              toast.success("Folder deleted. Your pieces are untouched.");
            } catch {
              toast.error("Couldn't delete that folder.");
            }
          }}
          aria-label={`Delete folder ${playlist.name}`}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-ink/50 ring-1 ring-ink/10 hover:bg-ink/5"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}
