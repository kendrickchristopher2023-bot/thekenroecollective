import { describe, it, expect } from "vitest";
import {
  PIECE_TIERS,
  SPEECH_TIERS,
  PIECE_PRICE_KEYS,
  tiersFor,
  tierForSeconds,
  tierForPriceKey,
  kindForPriceKey,
  priceLabelForSeconds,
  isAudition,
  AUDITION_MAX_SECONDS,
} from "@/lib/music-studio-pricing";

describe("studio price ladders", () => {
  it("keeps auditions free on both ladders", () => {
    for (const kind of ["song", "poem", "letter"] as const) {
      expect(tierForSeconds(AUDITION_MAX_SECONDS, kind)).toBeNull();
      expect(priceLabelForSeconds(10, kind)).toBe("Free");
    }
    expect(isAudition(AUDITION_MAX_SECONDS)).toBe(true);
    expect(isAudition(AUDITION_MAX_SECONDS + 1)).toBe(false);
  });

  it("puts songs on the music ladder and speech on the cheaper one", () => {
    expect(tiersFor("song")).toBe(PIECE_TIERS);
    expect(tiersFor("poem")).toBe(SPEECH_TIERS);
    expect(tiersFor("letter")).toBe(SPEECH_TIERS);
    // Defaults to the song ladder, so an un-migrated caller can never undercharge.
    expect(tiersFor()).toBe(PIECE_TIERS);
  });

  it("charges speech less than song at every length", () => {
    for (let i = 0; i < PIECE_TIERS.length; i++) {
      const song = PIECE_TIERS[i]!;
      const speech = SPEECH_TIERS[i]!;
      expect(speech.maxSeconds).toBe(song.maxSeconds);
      expect(speech.amountCents).toBeLessThan(song.amountCents);
    }
  });

  it("picks the right tier for a length on each ladder", () => {
    expect(tierForSeconds(60, "song")!.priceKey).toBe("music_piece_1min");
    expect(tierForSeconds(60, "letter")!.priceKey).toBe("speech_piece_1min");
    expect(tierForSeconds(90, "poem")!.priceKey).toBe("speech_piece_2min");
    expect(tierForSeconds(240, "song")!.priceKey).toBe("music_piece_4min");
    expect(tierForSeconds(241, "song")).toBeNull();
  });

  it("resolves a paid lookup key back to its tier and ladder", () => {
    expect(tierForPriceKey("speech_piece_2min")!.amountCents).toBe(599);
    expect(kindForPriceKey("music_piece_1min")).toBe("song");
    expect(kindForPriceKey("speech_piece_1min")).toBe("letter");
    expect(kindForPriceKey("not_a_price")).toBeNull();
  });

  it("exposes every chargeable key to the checkout allow-list", () => {
    expect(PIECE_PRICE_KEYS).toHaveLength(6);
    for (const key of PIECE_PRICE_KEYS) {
      expect(tierForPriceKey(key)).not.toBeNull();
      // The webhook releases a credit by matching these two prefixes only.
      expect(key.startsWith("music_piece_") || key.startsWith("speech_piece_")).toBe(true);
    }
    expect(new Set(PIECE_PRICE_KEYS).size).toBe(PIECE_PRICE_KEYS.length);
  });
});
