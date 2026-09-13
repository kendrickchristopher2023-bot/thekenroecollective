// Internal (owner-only) technical changelog.
//
// This is NOT auto-generated from git: commit messages in this project are
// mostly generic ("Changes"), so they carry no usable signal. Entries are
// written at publish time and tagged with the commit SHA that was live, which
// keeps the log honest about what actually shipped without pretending to be
// automatic.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DevChangelogEntry = {
  id: string;
  commit_sha: string | null;
  published_at: string;
  title: string;
  body_md: string;
  category: string;
  severity: string;
  files: string[];
};

const CATEGORIES = ["fix", "feature", "security", "infra", "data", "content"] as const;

async function assertOwner(context: { supabase: any; userId: string }) {
  const { assertOwnerAccess } = await import("@/lib/owner-guard.server");
  await assertOwnerAccess(context.supabase, context.userId);
}

export const listDevChangelog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z
      .object({
        since: z.string().optional(),
        category: z.enum(CATEGORIES).optional(),
        search: z.string().trim().max(200).optional(),
      }), input ?? {}, "dev-changelog.functions.ts:39"),
  )
  .handler(async ({ data, context }): Promise<DevChangelogEntry[]> => {
    await assertOwner(context);
    let q = context.supabase
      .from("dev_changelog")
      .select("id,commit_sha,published_at,title,body_md,category,severity,files")
      .order("published_at", { ascending: false })
      .limit(500);
    if (data.since) q = q.gte("published_at", data.since);
    if (data.category) q = q.eq("category", data.category);
    if (data.search) q = q.or(`title.ilike.%${data.search}%,body_md.ilike.%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as DevChangelogEntry[];
  });

export const addDevChangelogEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z
      .object({
        title: z.string().trim().min(3).max(300),
        bodyMd: z.string().trim().max(8000).default(""),
        category: z.enum(CATEGORIES).default("fix"),
        severity: z.enum(["low", "normal", "high"]).default("normal"),
        commitSha: z.string().trim().max(60).optional(),
        publishedAt: z.string().optional(),
        files: z.array(z.string().max(300)).max(50).default([]),
      }), input, "dev-changelog.functions.ts:69"),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { error } = await context.supabase.from("dev_changelog").insert({
      title: data.title,
      body_md: data.bodyMd,
      category: data.category,
      severity: data.severity,
      commit_sha: data.commitSha ?? null,
      published_at: data.publishedAt ?? new Date().toISOString(),
      files: data.files,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteDevChangelogEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(z.object({ id: z.string().uuid() }), input, "dev-changelog.functions.ts:88"))
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { error } = await context.supabase.from("dev_changelog").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
