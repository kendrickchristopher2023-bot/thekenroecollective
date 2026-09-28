import { describe, expect, it } from "vitest";
import {
  isBrowserOnlyMediaUrl,
  isEmailSafeImageUrl,
  sanitizeEmailImageData,
} from "@/lib/email/image-url";

describe("email image safety", () => {
  it("rejects URLs that only work in a browser", () => {
    for (const bad of ["data:image/gif;base64,AAA", "blob:http://x/y", "/uploads/a.gif", "http://x.com/a.gif"]) {
      expect(isEmailSafeImageUrl(bad), bad).toBe(false);
      if (!bad.startsWith("http")) expect(isBrowserOnlyMediaUrl(bad), bad).toBe(true);
    }
  });

  it("accepts hosted https media on our own or Giphy domains", () => {
    expect(isEmailSafeImageUrl("https://media1.giphy.com/media/x/giphy.gif")).toBe(true);
    expect(isEmailSafeImageUrl("https://i.giphy.com/x.gif")).toBe(true);
    expect(isEmailSafeImageUrl("https://thekenroecollective.com/logo.png")).toBe(true);
    expect(isEmailSafeImageUrl("https://abc.supabase.co/storage/v1/object/public/m/a.jpg")).toBe(true);
    expect(isEmailSafeImageUrl("https://evil.example.com/a.gif")).toBe(false);
  });

  it("drops unusable images and reports which keys were removed", () => {
    const { data, dropped } = sanitizeEmailImageData({
      gif: "data:image/gif;base64,AAA",
      photo: "https://media1.giphy.com/p.jpg",
      message: "keep me",
    });
    expect(dropped).toEqual(["gif"]);
    expect(data.gif).toBeUndefined();
    expect(data.photo).toBeTruthy();
    expect(data.message).toBe("keep me");
  });
});
