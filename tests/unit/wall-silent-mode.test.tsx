// @vitest-environment jsdom
// Silent wall: the host turns the wall's audio off for tonight without losing
// the songs. The wall screen must say so plainly and offer no transport.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/photo-wall.functions", () => ({ listWallMusic: vi.fn() }));

const { WallMusicPlayer } = await import("@/components/wall-music-player");

const tracks = [
  { id: "t1", title: "Tenia's Theme", artist: null, url: "https://x.test/a.mp3", bpm: 110 },
];

describe("wall audio off for tonight", () => {
  afterEach(() => cleanup());

  it("says the songs are kept and hides the transport", () => {
    render(<WallMusicPlayer tracks={tracks} silent />);
    expect(screen.getByText(/Sound off for tonight/i)).toBeTruthy();
    expect(screen.queryByLabelText("Start soundtrack")).toBeNull();
    expect(screen.queryByLabelText("Music volume")).toBeNull();
  });

  it("offers start, mute and a visible volume level when sound is on", () => {
    render(<WallMusicPlayer tracks={tracks} />);
    expect(screen.getByLabelText("Start soundtrack")).toBeTruthy();
    expect(screen.getByLabelText("Music volume")).toBeTruthy();
    expect(screen.getByLabelText("Mute music")).toBeTruthy();
    expect(screen.getByText("60%")).toBeTruthy();
  });
});
