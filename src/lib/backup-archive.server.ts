// One-click off-platform copy.
//
// Streams a ZIP archive built on the fly from private backup storage so the
// owner can keep a copy on their own machine without downloading 97 files by
// hand. Entries are STOREd (no compression) because the database exports are
// already gzipped and the uploaded files are photos/audio.
//
// Access: the archive route is under /api/public/* (so it is reachable as a
// plain browser download), and is gated by a short-lived HMAC ticket that only
// an owner-authenticated server function can mint.
import { createHmac, timingSafeEqual } from "crypto";

export type ArchiveKind = "database" | "files";

const TICKET_TTL_MS = 10 * 60 * 1000;

async function ticketSecret(): Promise<string> {
  const { getCronSharedSecret } = await import("@/lib/cron-auth.server");
  const s = await getCronSharedSecret();
  if (!s) throw new Error("Download tickets are unavailable right now");
  return s;
}

function sign(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Mint a signed, short-lived download ticket for one archive. */
export async function mintArchiveTicket(kind: ArchiveKind, prefix: string) {
  const exp = Date.now() + TICKET_TTL_MS;
  const payload = `${kind}:${prefix}:${exp}`;
  const sig = sign(await ticketSecret(), payload);
  return { kind, prefix, exp, sig };
}

export async function verifyArchiveTicket(
  kind: string,
  prefix: string,
  exp: string,
  sig: string,
): Promise<boolean> {
  if (!/^(database|files)$/.test(kind)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prefix)) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now()) return false;
  try {
    const expected = sign(await ticketSecret(), `${kind}:${prefix}:${expNum}`);
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- zip writer

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date) {
  const time = ((d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1)) & 0xffff;
  const date =
    (((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate()) & 0xffff;
  return { time, date };
}

class Writer {
  private parts: number[] = [];
  u16(v: number) {
    this.parts.push(v & 0xff, (v >>> 8) & 0xff);
  }
  u32(v: number) {
    this.parts.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  }
  bytes(b: Uint8Array) {
    for (let i = 0; i < b.length; i++) this.parts.push(b[i]!);
  }
  done() {
    return new Uint8Array(this.parts);
  }
}

export type ZipEntry = { name: string; bytes: Uint8Array };

/**
 * Build a ZIP as a ReadableStream, pulling one entry into memory at a time so a
 * 50 MB archive never sits in the worker whole.
 */
export function zipStream(entries: () => AsyncGenerator<ZipEntry>): ReadableStream<Uint8Array> {
  const now = new Date();
  const { time, date } = dosDateTime(now);
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];
  let offset = 0;
  const iterator = entries();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (!next.done) {
        const entry = next.value;
        const name = new TextEncoder().encode(entry.name);
        const crc = crc32(entry.bytes);
        const w = new Writer();
        w.u32(0x04034b50);
        w.u16(20);
        w.u16(0);
        w.u16(0); // stored
        w.u16(time);
        w.u16(date);
        w.u32(crc);
        w.u32(entry.bytes.length);
        w.u32(entry.bytes.length);
        w.u16(name.length);
        w.u16(0);
        w.bytes(name);
        const header = w.done();
        central.push({ name, crc, size: entry.bytes.length, offset });
        controller.enqueue(header);
        controller.enqueue(entry.bytes);
        offset += header.length + entry.bytes.length;
        return;
      }

      const cd = new Writer();
      for (const e of central) {
        cd.u32(0x02014b50);
        cd.u16(20);
        cd.u16(20);
        cd.u16(0);
        cd.u16(0);
        cd.u16(time);
        cd.u16(date);
        cd.u32(e.crc);
        cd.u32(e.size);
        cd.u32(e.size);
        cd.u16(e.name.length);
        cd.u16(0);
        cd.u16(0);
        cd.u16(0);
        cd.u16(0);
        cd.u32(0);
        cd.u32(e.offset);
        cd.bytes(e.name);
      }
      const dirBytes = cd.done();
      const end = new Writer();
      end.u32(0x06054b50);
      end.u16(0);
      end.u16(0);
      end.u16(central.length);
      end.u16(central.length);
      end.u32(dirBytes.length);
      end.u32(offset);
      end.u16(0);
      controller.enqueue(dirBytes);
      controller.enqueue(end.done());
      controller.close();
    },
  });
}

// ------------------------------------------------------------ archive bodies

/** Every file of one nightly database export, plus its manifest and a README. */
export async function databaseArchive(prefix: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: files, error } = await supabaseAdmin.storage
    .from("db-backups")
    .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(error.message);
  const names = (files ?? []).map((f) => f.name);
  if (names.length === 0) throw new Error("That database export is no longer available");

  return zipStream(async function* () {
    yield {
      name: `kenroe-database-${prefix}/README.txt`,
      bytes: new TextEncoder().encode(
        [
          `Kenroe Collective database export — ${prefix}`,
          "",
          "One gzipped JSON file per table, shaped as { table, exported_at, rows: [...] }.",
          "manifest.json lists every table, its row count and size.",
          "",
          "Keep this archive somewhere off this platform (your own machine plus a",
          "cloud drive is enough). A weekly copy is the recommended habit.",
          "Restore steps: docs/disaster-recovery.md in the code repository.",
        ].join("\n"),
      ),
    };
    for (const name of names) {
      const { data, error: dlErr } = await supabaseAdmin.storage
        .from("db-backups")
        .download(`${prefix}/${name}`);
      if (dlErr || !data) continue;
      yield {
        name: `kenroe-database-${prefix}/${name}`,
        bytes: new Uint8Array(await data.arrayBuffer()),
      };
    }
  });
}

/** The uploaded-file mirror: every object with a second copy, by bucket. */
export async function filesArchive(prefix: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("storage_backup_objects" as never)
    .select("bucket_id, object_path, mirror_path, size, status")
    .in("status", ["mirrored", "deleted"])
    .limit(5000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as {
    bucket_id: string;
    object_path: string;
    mirror_path: string;
    size: number;
    status: string;
  }[];
  if (rows.length === 0) throw new Error("No files have been mirrored yet");

  return zipStream(async function* () {
    yield {
      name: `kenroe-files-${prefix}/README.txt`,
      bytes: new TextEncoder().encode(
        [
          `Kenroe Collective uploaded files — ${prefix}`,
          "",
          `${rows.length} files, grouped into a folder per original location.`,
          "These are the photos, images and songs guests and hosts uploaded.",
          "This is the part of the data with no other copy, so keep it.",
        ].join("\n"),
      ),
    };
    yield {
      name: `kenroe-files-${prefix}/manifest.json`,
      bytes: new TextEncoder().encode(
        JSON.stringify(
          {
            prefix,
            generated_at: new Date().toISOString(),
            count: rows.length,
            bytes: rows.reduce((a, r) => a + (Number(r.size) || 0), 0),
            files: rows.map((r) => ({
              bucket: r.bucket_id,
              path: r.object_path,
              status: r.status,
              size: r.size,
            })),
          },
          null,
          2,
        ),
      ),
    };
    for (const r of rows) {
      const { data: blob, error: dlErr } = await supabaseAdmin.storage
        .from("storage-backups")
        .download(r.mirror_path);
      if (dlErr || !blob) continue;
      yield {
        name: `kenroe-files-${prefix}/${r.bucket_id}/${r.object_path}`,
        bytes: new Uint8Array(await blob.arrayBuffer()),
      };
    }
  });
}
