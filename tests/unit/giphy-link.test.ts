import { expect, test } from "vitest";
import { giphyUrlFromLink as f } from "@/lib/giphy-link";
test("giphyUrlFromLink accepts GIPHY page and media links only", () => {
  expect(f("https://giphy.com/gifs/thank-you-thanks-abc123XYZ")).toBe(
    "https://media.giphy.com/media/abc123XYZ/giphy.gif",
  );
  expect(f("https://media2.giphy.com/media/v1.Y2lkPTc5/abc123/giphy.gif?cid=x")).toBe(
    "https://media.giphy.com/media/abc123/giphy.gif",
  );
  expect(f("https://media.giphy.com/media/abc123/giphy.gif")).toBe(
    "https://media.giphy.com/media/abc123/giphy.gif",
  );
  expect(f("https://i.giphy.com/abc123.gif")).toBe(
    "https://media.giphy.com/media/abc123/giphy.gif",
  );
  expect(f("https://evil.com/gifs/x-abc")).toBeNull();
  expect(f("javascript:alert(1)")).toBeNull();
  expect(f("not a url")).toBeNull();
});
