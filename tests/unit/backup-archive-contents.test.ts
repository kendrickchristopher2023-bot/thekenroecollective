import { describe, it, expect, vi } from "vitest";

const downloads: string[] = [];

vi.mock("@/integrations/supabase/client.server", () => {
  const blob = (s: string) => ({ arrayBuffer: async () => new TextEncoder().encode(s).buffer });
  return {
    supabaseAdmin: {
      storage: {
        from(bucket: string) {
          return {
            list: async () => ({
              data: [{ name: "events.json.gz" }, { name: "manifest.json" }],
              error: null,
            }),
            download: async (path: string) => {
              downloads.push(`${bucket}/${path}`);
              return { data: blob(`bytes:${path}`), error: null };
            },
          };
        },
      },
      from() {
        return {
          select() {
            return {
              in() {
                return {
                  limit: async () => ({
                    data: [
                      {
                        bucket_id: "event-photos",
                        object_path: "abc/one.jpg",
                        mirror_path: "event-photos/abc/one.jpg",
                        size: 12,
                        status: "mirrored",
                      },
                    ],
                    error: null,
                  }),
                };
              },
            };
          },
        };
      },
    },
  };
});

async function text(stream: ReadableStream<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("latin1");
}

describe("backup archives", () => {
  it("database archive holds every exported table file plus a README", async () => {
    const { databaseArchive } = await import("@/lib/backup-archive.server");
    const body = await text(await databaseArchive("2026-09-04"));
    expect(body).toContain("kenroe-database-2026-09-04/README.txt");
    expect(body).toContain("kenroe-database-2026-09-04/events.json.gz");
    expect(body).toContain("kenroe-database-2026-09-04/manifest.json");
    expect(body).toContain("bytes:2026-09-04/events.json.gz");
    expect(downloads).toContain("db-backups/2026-09-04/events.json.gz");
  });

  it("files archive keeps the original bucket and path, with a manifest", async () => {
    const { filesArchive } = await import("@/lib/backup-archive.server");
    const body = await text(await filesArchive("2026-09-05"));
    expect(body).toContain("kenroe-files-2026-09-05/event-photos/abc/one.jpg");
    expect(body).toContain("kenroe-files-2026-09-05/manifest.json");
    expect(body).toContain("bytes:event-photos/abc/one.jpg");
  });
});
