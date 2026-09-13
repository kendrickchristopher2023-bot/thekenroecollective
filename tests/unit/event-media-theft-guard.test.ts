import { describe, expect, it } from "vitest";
import {
  checkEventMediaOwnership,
  checkEventSoundPieceOwnership,
  REFUSAL_OTHER_ACCOUNT,
  REFUSAL_OTHER_EVENT,
  REFUSAL_SHOWCASE,
} from "@/lib/event-media-theft-guard.server";
import { stripRefusedMedia } from "@/lib/event-media-strip";

const BASE = "https://example.supabase.co/storage/v1/object";
const OWNER = "11111111-1111-4111-8111-111111111111";
const COHOST = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";
const SHOWCASE_SYSTEM = "b72c64c1-1111-4ead-9ff1-57018eb5b38f";

const scope = { allowedOwnerIds: [OWNER, COHOST], eventId: "evt1", previousData: null };

const own = `${BASE}/public/atelier-shared/${OWNER}/1-hero.jpg`;
const cohost = `${BASE}/public/atelier-shared/${COHOST}/2-photo.jpg`;
const stranger = `${BASE}/public/atelier-shared/${STRANGER}/3-monroe_family_pic.jpg`;
const strangerSigned = `${BASE}/sign/atelier-media-private/${STRANGER}/4.png?token=abc`;
const showcaseWall = `${BASE}/public/event-photos/showcase-wedding/showcase/wall-1.jpg`;
const showcaseUserFolder = `${BASE}/public/atelier-shared/${SHOWCASE_SYSTEM}/x.jpg`;
const ownWall = `${BASE}/public/event-photos/evt1/1-guest.jpg`;
const otherEventWall = `${BASE}/public/event-photos/uqj67dor/1-guest.jpg`;
const ownNarration = `${BASE}/sign/sound-pieces/invite-narration/evt1/voice/hash.mp3?token=1`;
const otherNarration = `${BASE}/sign/sound-pieces/invite-narration/zzz/voice/hash.mp3?token=1`;
const ownPiece = `${BASE}/public/sound-pieces/${OWNER}/piece.mp3`;
const strangerPiece = `${BASE}/public/sound-pieces/${STRANGER}/piece.mp3`;
const external = "https://media.giphy.com/media/abc/giphy.gif";

describe("event media copy protection", () => {
  it("accepts the host's own, co-host, guest-wall, narration and library media plus external links", () => {
    const res = checkEventMediaOwnership(
      {
        heroImage: own,
        gallery: [{ url: cohost, kind: "image" }, { url: external, kind: "gif" }, ownWall],
        theme: { art: own, logo: cohost },
        voiceMessage: ownNarration,
        soundtrack: { url: ownPiece },
      },
      scope,
    );
    expect(res.ok).toBe(true);
    expect(res.refused).toEqual([]);
  });

  it("refuses another account's user-folder media in every field, public or signed", () => {
    const res = checkEventMediaOwnership(
      { heroImage: stranger, gallery: [{ url: strangerSigned }], theme: { logo: strangerPiece } },
      scope,
    );
    expect(res.ok).toBe(false);
    expect(res.refused.map((r) => r.value)).toEqual([stranger, strangerSigned, strangerPiece]);
    expect(res.refused.every((r) => r.reason === REFUSAL_OTHER_ACCOUNT)).toBe(true);
  });

  it("refuses another event's event-folder media even when the saver could edit that event", () => {
    const res = checkEventMediaOwnership({ gallery: [otherEventWall], voiceMessage: otherNarration }, scope);
    expect(res.ok).toBe(false);
    expect(res.refused.map((r) => r.reason)).toEqual([REFUSAL_OTHER_EVENT, REFUSAL_OTHER_EVENT]);
  });

  it("never lets the showcase's folders be reused, in any bucket", () => {
    const res = checkEventMediaOwnership({ heroImage: showcaseWall, gallery: [{ url: showcaseUserFolder }] }, scope);
    expect(res.ok).toBe(false);
    expect(res.refused.map((r) => r.reason)).toEqual([REFUSAL_SHOWCASE, REFUSAL_SHOWCASE]);
  });

  it("grandfathers anything the cloud row already referenced", () => {
    const res = checkEventMediaOwnership(
      { heroImage: stranger, gallery: [showcaseWall] },
      { ...scope, previousData: { heroImage: stranger, gallery: [showcaseWall] } },
    );
    expect(res.ok).toBe(true);
  });

  it("lets a host reuse their own library media on a second event", () => {
    const res = checkEventMediaOwnership({ heroImage: own, gallery: [ownPiece] }, { ...scope, eventId: "evt2" });
    expect(res.ok).toBe(true);
  });

  it("checks new studio-piece share links against sound_pieces and returns the refused strings", async () => {
    const db = {
      from: () => ({
        select: () => ({
          or: async () => ({
            data: [
              { user_id: OWNER, share_token: "mine", share_slug: null, is_demo: false },
              { user_id: STRANGER, share_token: "theirs", share_slug: null, is_demo: false },
            ],
            error: null,
          }),
        }),
      }),
    };
    const res = await checkEventSoundPieceOwnership(
      db,
      { song: "https://thekenroecollective.com/sound/mine", poem: "https://thekenroecollective.com/sound/theirs" },
      scope,
    );
    expect(res.ok).toBe(false);
    expect(res.refused.map((r) => r.value)).toEqual(["https://thekenroecollective.com/sound/theirs"]);
  });
});

describe("stripRefusedMedia keeps the rest of the save", () => {
  it("drops only the refused links and whole gallery tiles, leaving everything else untouched", () => {
    const data = {
      title: "Spring dinner",
      heroImage: stranger,
      gallery: [{ url: own, kind: "image" }, { url: showcaseWall, kind: "image" }, external],
      guests: [{ name: "Ada", address: "1 Main St" }],
      theme: { art: own, logo: strangerSigned, color: "#fff" },
    };
    const out = stripRefusedMedia(data, [stranger, showcaseWall, strangerSigned]);
    expect(out).toEqual({
      title: "Spring dinner",
      gallery: [{ url: own, kind: "image" }, external],
      guests: [{ name: "Ada", address: "1 Main St" }],
      theme: { art: own, color: "#fff" },
    });
  });

  it("returns the same object when nothing is refused", () => {
    const data = { heroImage: own, gallery: [own] };
    expect(stripRefusedMedia(data, [])).toBe(data);
    expect(stripRefusedMedia(data, [stranger])).toBe(data);
  });
});
