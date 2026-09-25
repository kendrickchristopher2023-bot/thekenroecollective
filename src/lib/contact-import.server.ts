// Contact import: turns a spreadsheet, photo, PDF or pasted text into rows for
// the review table. Nothing here saves contacts; the owner confirms first.

import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalPhone } from "@/lib/phone-keys";

export const IMPORT_LIMITS = {
  sheetBytes: 5 * 1024 * 1024,
  imageBytes: 10 * 1024 * 1024,
  pdfBytes: 10 * 1024 * 1024,
  pdfPages: 10,
  textChars: 20_000,
  maxRows: 500,
};

export interface ImportRow {
  name: string;
  phone: string;
  email: string;
  confidence: { name: number; phone: number; email: number };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** US-default E.164. Returns "" when it cannot be made valid. */
export function toE164(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  const c = canonicalPhone(digits);
  if (c.length === 10) return `+1${c}`;
  return "";
}
export function validEmail(raw: string): boolean {
  return EMAIL_RE.test(String(raw ?? "").trim());
}

function pick(obj: Record<string, unknown>, keys: RegExp): string {
  for (const [k, v] of Object.entries(obj)) if (keys.test(k.trim())) return String(v ?? "").trim();
  return "";
}

/** Spreadsheets are parsed directly, free, with no AI. */
export async function parseSheet(buf: Uint8Array): Promise<ImportRow[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "array" });
  const out: ImportRow[] = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]!, { defval: "" });
    for (const r of rows) {
      let full = pick(r, /^(full ?name|name|contact|display ?name)$/i);
      if (!full) full = [pick(r, /^first( ?name)?$/i), pick(r, /^last( ?name)?$/i)].filter(Boolean).join(" ");
      const phone = pick(r, /(phone|mobile|cell|tel)/i);
      const email = pick(r, /e-?mail/i);
      if (!full && !phone && !email) continue;
      out.push({ name: full, phone, email, confidence: { name: 1, phone: 1, email: 1 } });
      if (out.length >= IMPORT_LIMITS.maxRows) return out;
    }
  }
  return out;
}

export function countPdfPages(buf: Uint8Array): number {
  const txt = new TextDecoder("latin1").decode(buf);
  return (txt.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

const SCHEMA_TOOL = {
  type: "function",
  function: {
    name: "contacts",
    description: "Every person found in the source.",
    parameters: {
      type: "object",
      properties: {
        people: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              phone: { type: "string" },
              email: { type: "string" },
              name_confidence: { type: "number" },
              phone_confidence: { type: "number" },
              email_confidence: { type: "number" },
            },
            required: ["name", "phone", "email", "name_confidence", "phone_confidence", "email_confidence"],
          },
        },
      },
      required: ["people"],
    },
  },
};

/** Photos, PDFs and pasted text go to Lovable AI. */
export async function extractWithAi(input: { kind: "image" | "pdf" | "text"; mime?: string; base64?: string; text?: string }): Promise<ImportRow[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI is not configured");
  const sys =
    "You read contact lists, including handwritten ones. Extract every person with their name, phone and email exactly as written. Use an empty string when a value is missing. Confidence is 0 to 1 for how sure you are you read each value correctly; use a low number for smudged or unclear handwriting. Do not invent people or values.";
  const content: unknown[] = [{ type: "text", text: "Extract the contacts." }];
  if (input.kind === "text") content.push({ type: "text", text: input.text!.slice(0, IMPORT_LIMITS.textChars) });
  else if (input.kind === "image") content.push({ type: "image_url", image_url: { url: `data:${input.mime};base64,${input.base64}` } });
  else content.push({ type: "file", file: { filename: "contacts.pdf", file_data: `data:application/pdf;base64,${input.base64}` } });

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages: [{ role: "system", content: sys }, { role: "user", content }],
      tools: [SCHEMA_TOOL],
      tool_choice: { type: "function", function: { name: "contacts" } },
    }),
  });
  if (res.status === 429) throw new Error("The reader is busy right now. Please try again in a minute.");
  if (res.status === 402) throw new Error("AI credits have run out for this workspace.");
  if (!res.ok) {
    const t = await res.text();
    console.error("contact import AI failed", res.status, t.slice(0, 500));
    throw new Error("We couldn't read that file. Try a clearer photo, or a spreadsheet.");
  }
  const j = await res.json();
  const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  const parsed = typeof args === "string" ? JSON.parse(args) : args;
  const people = Array.isArray(parsed?.people) ? parsed.people : [];
  return people.slice(0, IMPORT_LIMITS.maxRows).map((p: any) => ({
    name: String(p.name ?? "").trim(),
    phone: String(p.phone ?? "").trim(),
    email: String(p.email ?? "").trim(),
    confidence: {
      name: Number(p.name_confidence ?? 0.5),
      phone: Number(p.phone_confidence ?? 0.5),
      email: Number(p.email_confidence ?? 0.5),
    },
  }));
}

/** Delete any import file older than 24 hours. */
export async function purgeOldImports(admin: SupabaseClient<any, any, any>): Promise<number> {
  const cutoff = new Date(Date.now() - 86_400_000).toISOString();
  const { data } = await admin
    .from("contact_imports")
    .select("id,storage_path")
    .lt("created_at", cutoff)
    .not("storage_path", "is", null);
  const rows = (data ?? []) as { id: string; storage_path: string }[];
  if (!rows.length) return 0;
  await admin.storage.from("contact-imports").remove(rows.map((r) => r.storage_path));
  await admin
    .from("contact_imports")
    .update({ storage_path: null, status: "discarded" })
    .in("id", rows.map((r) => r.id))
    .neq("status", "confirmed");
  await admin.from("contact_imports").update({ storage_path: null }).in("id", rows.map((r) => r.id));
  return rows.length;
}
