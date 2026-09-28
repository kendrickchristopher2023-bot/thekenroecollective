// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { externalizeInlineEventMedia } from "@/lib/media-upload-client";
import type { KEvent } from "@/lib/events-store";

function eventWithInlineMedia(): KEvent {
  return {
    id: "event-1",
    title: "Payload regression",
    createdAt: "2026-08-24T00:00:00.000Z",
    guests: [],
    hosts: [{ id: "host-1", name: "Host", role: "Host", photo: "data:image/jpeg;base64,aG9zdA==" }],
    inviteMedia: [{ id: "media-1", kind: "image", url: "data:image/png;base64,Z2FsbGVyeQ==" }],
    voiceMessage: "data:audio/webm;base64,dm9pY2U=",
    thankYouCards: [{
      id: "thanks-1",
      message: "Thanks",
      design: "ivory",
      photo: "data:image/jpeg;base64,dGhhbmtz",
      recipientIds: [],
      channel: "email",
      createdAt: "2026-08-24T00:00:00.000Z",
    }],
  } as KEvent;
}

describe("event media externalization", () => {
  it("replaces every legacy inline event asset with a storage URL", async () => {
    const upload = vi.fn(async (_file: File, filename?: string) => `https://media.test/${filename}`);
    const next = await externalizeInlineEventMedia(eventWithInlineMedia(), upload);

    expect(upload).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(next)).not.toContain("data:");
    expect(next.hosts?.[0]?.photo).toMatch(/^https:\/\/media\.test\//);
    expect(next.inviteMedia?.[0]?.url).toMatch(/^https:\/\/media\.test\//);
    expect(next.voiceMessage).toMatch(/^https:\/\/media\.test\//);
    expect(next.thankYouCards?.[0]?.photo).toMatch(/^https:\/\/media\.test\//);
  });

  it("does not mutate the event if all media already uses URLs", async () => {
    const event = { ...eventWithInlineMedia(), hosts: [], inviteMedia: [], voiceMessage: "https://media.test/voice.webm", thankYouCards: [] };
    const upload = vi.fn();
    const next = await externalizeInlineEventMedia(event, upload);

    expect(next).toBe(event);
    expect(upload).not.toHaveBeenCalled();
  });

  it("keeps the original event intact when an upload fails", async () => {
    const event = eventWithInlineMedia();
    await expect(externalizeInlineEventMedia(event, async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    expect(event.hosts?.[0]?.photo).toContain("data:image/jpeg;base64");
  });
});