// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listWallMusic = vi.fn();
const addWallMusicLink = vi.fn();
const generateWallSong = vi.fn();
const regenerateWallSong = vi.fn();
const listReusableAiSongs = vi.fn();
const copyWallSongToEvent = vi.fn();
const reorderWallMusic = vi.fn();
const deleteWallMusic = vi.fn();
const uploadWallMusic = vi.fn();
const renameWallMusic = vi.fn();
const updateEvent = vi.fn();

vi.mock("@/lib/photo-wall.functions", () => ({
  listWallMusic: (...args: unknown[]) => listWallMusic(...args),
  addWallMusicLink: (...args: unknown[]) => addWallMusicLink(...args),
  generateWallSong: (...args: unknown[]) => generateWallSong(...args),
  regenerateWallSong: (...args: unknown[]) => regenerateWallSong(...args),
  listReusableAiSongs: (...args: unknown[]) => listReusableAiSongs(...args),
  copyWallSongToEvent: (...args: unknown[]) => copyWallSongToEvent(...args),
  reorderWallMusic: (...args: unknown[]) => reorderWallMusic(...args),
  deleteWallMusic: (...args: unknown[]) => deleteWallMusic(...args),
  uploadWallMusic: (...args: unknown[]) => uploadWallMusic(...args),
  renameWallMusic: (...args: unknown[]) => renameWallMusic(...args),
}));

const currentEvent: Record<string, unknown> = { id: "e1", wallNoCrossfade: false };

vi.mock("@/lib/events-store", () => ({
  updateEvent: (...args: unknown[]) => updateEvent(...args),
  useEvent: () => currentEvent,
}));


vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/confirm-dialog", () => ({
  confirmDialog: () => Promise.resolve(true),
}));

const { WallSoundtrackPanel } = await import("@/components/wall-soundtrack-panel");

describe("host soundtrack panel", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    listWallMusic.mockResolvedValue([
      {
        id: "t1",
        title: "Sunset Drive",
        source: "upload",
        seconds: 184,
        url: "https://example.test/a.mp3",
        bpm: 96,
        link: null,
      },
      {
        id: "t2",
        title: "Reunion Theme",
        source: "ai",
        seconds: 30,
        url: "https://example.test/b.mp3",
        bpm: 110,
        link: null,
      },
    ]);
  });

  it("lists existing tracks with tempo and length", async () => {
    render(<WallSoundtrackPanel eventId="evt1" />);
    expect(await screen.findByText("Sunset Drive")).toBeTruthy();
    expect(screen.getByText(/3:04/)).toBeTruthy();
    expect(screen.getByText(/96 BPM/)).toBeTruthy();
    expect(screen.getByText(/AI song/)).toBeTruthy();
  });

  it("saves a new order when a track is moved", async () => {
    reorderWallMusic.mockResolvedValue(undefined);
    render(<WallSoundtrackPanel eventId="evt1" />);
    await screen.findByText("Sunset Drive");
    await userEvent.click(screen.getByLabelText("Move Sunset Drive down"));
    await waitFor(() =>
      expect(reorderWallMusic).toHaveBeenCalledWith({
        data: { eventId: "evt1", trackIds: ["t2", "t1"] },
      }),
    );
  });

  it("adds a streaming playlist card", async () => {
    addWallMusicLink.mockResolvedValue(undefined);
    render(<WallSoundtrackPanel eventId="evt1" />);
    await screen.findByText("Sunset Drive");
    await userEvent.type(
      screen.getByLabelText("Playlist link"),
      "https://open.spotify.com/playlist/abc",
    );
    await userEvent.click(screen.getByRole("button", { name: /Add card/i }));
    await waitFor(() =>
      expect(addWallMusicLink).toHaveBeenCalledWith({
        data: { eventId: "evt1", url: "https://open.spotify.com/playlist/abc" },
      }),
    );
  });

  it("composes a song from the host's words and dials", async () => {
    generateWallSong.mockResolvedValue(undefined);
    render(<WallSoundtrackPanel eventId="evt1" />);
    await screen.findByText("Sunset Drive");
    await userEvent.type(screen.getByLabelText("Song description"), "family reunion");
    await userEvent.click(screen.getByRole("button", { name: /^Compose the 1 minute song$/i }));
    await waitFor(() => expect(generateWallSong).toHaveBeenCalled());
    const arg = generateWallSong.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data["eventId"]).toBe("evt1");
    expect(arg.data["words"]).toBe("family reunion");
    expect(arg.data["genre"]).toBeTruthy();
  });

  it("composes a longer song when the host picks 3 minutes", async () => {
    generateWallSong.mockResolvedValue(undefined);
    render(<WallSoundtrackPanel eventId="evt1" />);
    await screen.findByText("Sunset Drive");
    await userEvent.click(screen.getByRole("button", { name: /^3 minutes$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^Compose the 3 minutes song$/i }));
    await waitFor(() => expect(generateWallSong).toHaveBeenCalled());
    const arg = generateWallSong.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data["seconds"]).toBe(180);
  });

  it("offers 10, 20 and 30 second samples", async () => {
    render(<WallSoundtrackPanel eventId="evt1" />);
    await screen.findByText("Sunset Drive");
    for (const secs of [10, 20, 30]) {
      expect(
        screen.getByRole("button", { name: new RegExp(`^Sample ${secs} seconds$`, "i") }),
      ).toBeTruthy();
    }
  });


  it("renames a track and keeps the new name on screen", async () => {
    renameWallMusic.mockResolvedValue({ ok: true, title: "Tenia's Theme" });
    render(<WallSoundtrackPanel eventId="evt1" />);
    await screen.findByText("Reunion Theme");
    await userEvent.click(screen.getByLabelText("Rename Reunion Theme"));
    const field = screen.getByLabelText("Name for Reunion Theme");
    await userEvent.clear(field);
    await userEvent.type(field, "Tenia's Theme{Enter}");
    await waitFor(() =>
      expect(renameWallMusic).toHaveBeenCalledWith({
        data: { eventId: "evt1", trackId: "t2", title: "Tenia's Theme" },
      }),
    );
    expect(await screen.findByText("Tenia's Theme")).toBeTruthy();
  });

  it("names an AI song while composing", async () => {
    generateWallSong.mockResolvedValue(undefined);
    render(<WallSoundtrackPanel eventId="evt1" />);
    await screen.findByText("Sunset Drive");
    await userEvent.type(screen.getByLabelText("Song name"), "Tenia's Theme");
    await userEvent.click(screen.getByRole("button", { name: /^Compose the 1 minute song$/i }));
    await waitFor(() => expect(generateWallSong).toHaveBeenCalled());
    const arg = generateWallSong.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data["title"]).toBe("Tenia's Theme");
  });

  it("puts a song on the invitation with its name", async () => {
    render(<WallSoundtrackPanel eventId="evt1" />);
    await screen.findByText("Reunion Theme");
    const buttons = screen.getAllByRole("button", { name: /Use on invitation/i });
    await userEvent.click(buttons[1]!);
    expect(updateEvent).toHaveBeenCalledWith("evt1", {
      songUrl: "https://example.test/b.mp3",
      songTitle: "Reunion Theme",
      songArtist: "",
      songAllowDownload: true,
    });
  });

  it("recomposes an AI song in place after confirmation", async () => {
    regenerateWallSong.mockResolvedValue({ ok: true });
    render(<WallSoundtrackPanel eventId="evt1" />);
    await screen.findByText("Reunion Theme");
    await userEvent.click(screen.getByLabelText("Recompose Reunion Theme"));
    await waitFor(() =>
      expect(regenerateWallSong).toHaveBeenCalledWith({
        data: { eventId: "evt1", trackId: "t2" },
      }),
    );
  });

  it("reuses a song composed for another event", async () => {
    listReusableAiSongs.mockResolvedValue([
      {
        trackId: "other1",
        eventId: "evt2",
        eventTitle: "Family BBQ",
        title: "BBQ Groove",
        artist: null,
        seconds: 30,
      },
    ]);
    copyWallSongToEvent.mockResolvedValue({ ok: true, title: "BBQ Groove" });
    render(<WallSoundtrackPanel eventId="evt1" />);
    await screen.findByText("Sunset Drive");
    await userEvent.click(screen.getByRole("button", { name: /Reuse a song/i }));
    await screen.findByText("BBQ Groove");
    await userEvent.click(screen.getByRole("button", { name: /Use here/i }));
    await waitFor(() =>
      expect(copyWallSongToEvent).toHaveBeenCalledWith({
        data: { trackId: "other1", targetEventId: "evt1" },
      }),
    );
  });

  it("blocks uploads until the licence box is ticked", async () => {
    render(<WallSoundtrackPanel eventId="evt1" />);
    await screen.findByText("Sunset Drive");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    await userEvent.click(screen.getAllByRole("checkbox").at(-1)!);
    expect(input.disabled).toBe(false);
  });

  it("takes the song off the invitation when its wall track is removed", async () => {
    currentEvent["songUrl"] = "https://example.test/a.mp3";
    deleteWallMusic.mockResolvedValue({ ok: true });
    render(<WallSoundtrackPanel eventId="evt1" />);
    await screen.findByText("Sunset Drive");
    await userEvent.click(screen.getByLabelText("Remove Sunset Drive"));
    await waitFor(() =>
      expect(updateEvent).toHaveBeenCalledWith("evt1", {
        songUrl: "",
        songTitle: "",
        songArtist: "",
        songAllowDownload: false,
      }),
    );
    delete currentEvent["songUrl"];
  });

  it("leaves the invitation alone when a different track is removed", async () => {
    currentEvent["songUrl"] = "https://example.test/b.mp3";
    deleteWallMusic.mockResolvedValue({ ok: true });
    render(<WallSoundtrackPanel eventId="evt1" />);
    await screen.findByText("Sunset Drive");
    await userEvent.click(screen.getByLabelText("Remove Sunset Drive"));
    await waitFor(() => expect(deleteWallMusic).toHaveBeenCalled());
    expect(updateEvent).not.toHaveBeenCalled();
    delete currentEvent["songUrl"];
  });

  it("renames the invitation song when the attached track is renamed", async () => {
    currentEvent["songUrl"] = "https://example.test/a.mp3";
    renameWallMusic.mockResolvedValue({ ok: true, title: "Golden Hour" });
    render(<WallSoundtrackPanel eventId="evt1" />);
    await screen.findByText("Sunset Drive");
    await userEvent.click(screen.getByLabelText("Rename Sunset Drive"));
    const field = screen.getByLabelText("Name for Sunset Drive");
    await userEvent.clear(field);
    await userEvent.type(field, "Golden Hour{Enter}");
    await waitFor(() =>
      expect(updateEvent).toHaveBeenCalledWith("evt1", { songTitle: "Golden Hour" }),
    );
    delete currentEvent["songUrl"];
  });

  it("offers a silent wall option that keeps the songs", async () => {
    render(<WallSoundtrackPanel eventId="evt1" />);
    await screen.findByText("Sunset Drive");
    const box = screen.getByRole("checkbox", { name: /Run this wall without sound/i });
    await userEvent.click(box);
    expect(updateEvent).toHaveBeenCalledWith("evt1", { wallSilent: true });
  });
});
