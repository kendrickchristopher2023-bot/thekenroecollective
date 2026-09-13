// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { EventSongCard } from "@/components/event-song";

describe("EventSongCard", () => {
  it("plays in the page and offers a download", () => {
    const { container } = render(
      <EventSongCard song={{ url: "https://cdn.test/song.mp3", title: "Our Song" }} />,
    );
    const audio = container.querySelector("audio");
    expect(audio).toBeTruthy();
    expect(audio?.getAttribute("src")).toBe("https://cdn.test/song.mp3");
    expect(audio?.hasAttribute("controls")).toBe(true);
    expect(audio?.hasAttribute("autoplay")).toBe(false);
    const link = container.querySelector("a[download]");
    expect(link?.getAttribute("download")).toBe("Our-Song.mp3");
  });

  it("hides download when the host turns it off", () => {
    const { container } = render(
      <EventSongCard song={{ url: "https://cdn.test/song.mp3", allowDownload: false }} />,
    );
    expect(container.querySelector("a[download]")).toBeNull();
    expect(container.textContent).toMatch(/Playback only/i);
  });
});
