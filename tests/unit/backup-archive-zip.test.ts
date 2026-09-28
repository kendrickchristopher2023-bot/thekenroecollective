import { describe, it, expect } from "vitest";
import { zipStream } from "@/lib/backup-archive.server";

async function collect(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

describe("backup archive zip writer", () => {
  it("writes a well-formed archive with one entry per file", async () => {
    const enc = new TextEncoder();
    const bytes = await collect(
      zipStream(async function* () {
        yield { name: "a/README.txt", bytes: enc.encode("hello") };
        yield { name: "a/rows.json", bytes: enc.encode(JSON.stringify({ rows: [1, 2, 3] })) };
      }),
    );

    // local headers, central directory entries, end-of-central-directory
    const hex = Buffer.from(bytes).toString("hex");
    expect(hex.split("504b0304").length - 1).toBe(2);
    expect(hex.split("504b0102").length - 1).toBe(2);
    expect(hex.endsWith("0000")).toBe(true);
    expect(hex).toContain("504b0506");
    expect(Buffer.from(bytes).includes("a/README.txt")).toBe(true);
    expect(Buffer.from(bytes).includes("hello")).toBe(true);
  });

  it("produces an empty but valid archive when there is nothing to add", async () => {
    const bytes = await collect(zipStream(async function* () {}));
    expect(Buffer.from(bytes).toString("hex")).toContain("504b0506");
  });
});
