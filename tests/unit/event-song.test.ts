import { describe, expect, it } from "vitest";
import { SONG_MAX_BYTES, songDownloadName, songFileError } from "@/components/event-song";

function file(name: string, type: string, size: number): File {
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("invitation song validation", () => {
  it("accepts common audio files", () => {
    expect(songFileError(file("song.mp3", "audio/mpeg", 4_000_000))).toBeNull();
    expect(songFileError(file("song.m4a", "", 1000))).toBeNull();
    expect(songFileError(file("song.wav", "audio/wav", 1000))).toBeNull();
  });

  it("rejects non-audio and oversized files", () => {
    expect(songFileError(file("deck.pdf", "application/pdf", 1000))).toMatch(/audio/i);
    expect(songFileError(file("song.mp3", "audio/mpeg", SONG_MAX_BYTES + 1))).toMatch(/20MB/);
  });

  it("builds a friendly download filename", () => {
    expect(songDownloadName({ url: "https://x/y/abc123.mp3?token=1", title: "Tenia's Song" })).toBe(
      "Tenias-Song.mp3",
    );
    expect(songDownloadName({ url: "https://x/y/track.wav" })).toBe("track.wav");
  });
});
