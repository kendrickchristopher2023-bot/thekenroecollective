import { describe, expect, it } from "vitest";
import { stripInlineMedia, refillFromRemote, isLocallyStripped } from "@/lib/events-store";

const big = "data:image/jpeg;base64," + "A".repeat(50_000);

describe("local snapshot media stripping", () => {
  it("drops large inline data URLs but keeps the rest of the event", () => {
    const ev = { id: "e1", title: "Reunion", hosts: [{ name: "Q", photo: big }], guests: [{ name: "A" }] };
    const { value, stripped } = stripInlineMedia(ev) as { value: any; stripped: boolean };
    expect(stripped).toBe(true);
    expect(value.hosts[0].photo).toBe("");
    expect(value.title).toBe("Reunion");
    expect(value.guests[0].name).toBe("A");
    expect(JSON.stringify(value).length).toBeLessThan(500);
  });

  it("leaves small strings and short data URLs alone", () => {
    const ev = { id: "e1", image: "https://cdn/x.jpg", icon: "data:image/svg+xml,<svg/>" };
    const { stripped } = stripInlineMedia(ev) as { stripped: boolean };
    expect(stripped).toBe(false);
  });

  it("refills stripped media from the cloud copy without losing local edits", () => {
    const local = { id: "e1", title: "New title", hosts: [{ name: "Q", photo: "" }] };
    const remote = { id: "e1", title: "Old title", hosts: [{ name: "Q", photo: big }] };
    const merged = refillFromRemote(local, remote) as any;
    expect(merged.title).toBe("New title");
    expect(merged.hosts[0].photo).toBe(big);
  });

  it("does not resurrect values the user intentionally cleared", () => {
    const local = {
      id: "e1",
      description: "",
      note: "",
      image: "",
      hosts: [{ id: "h1", name: "Q", photo: "" }],
    };
    const remote = {
      id: "e1",
      description: "Outdoor party",
      note: "bring chairs",
      image: "https://cdn/x.jpg",
      hosts: [{ id: "h1", name: "Q", photo: "https://cdn/h1.jpg" }],
    };
    const merged = refillFromRemote(local, remote) as any;
    expect(merged.description).toBe("");
    expect(merged.note).toBe("");
    expect(merged.image).toBe("");
    expect(merged.hosts[0].photo).toBe("");
  });

  it("matches array items by id so reordering cannot cross-refill media", () => {
    const other = "data:image/jpeg;base64," + "B".repeat(50_000);
    const local = {
      hosts: [
        { id: "h2", name: "Monica", photo: "" },
        { id: "h1", name: "Quinton", photo: "" },
      ],
    };
    const remote = {
      hosts: [
        { id: "h1", name: "Quinton", photo: big },
        { id: "h2", name: "Monica", photo: other },
      ],
    };
    const merged = refillFromRemote(local, remote) as any;
    expect(merged.hosts[0].photo).toBe(other); // Monica keeps Monica's photo
    expect(merged.hosts[1].photo).toBe(big);
  });

  it("flags stripped copies so they are never pushed as-is", () => {
    expect(isLocallyStripped({ _mediaStripped: true })).toBe(true);
    expect(isLocallyStripped({ id: "e1" })).toBe(false);
  });
});

