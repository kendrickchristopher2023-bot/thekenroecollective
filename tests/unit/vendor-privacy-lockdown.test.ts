import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RECURRENCE GUARD for the vendor privacy bug.
 *
 * `public.vendors` holds email, phone, review_notes, reviewed_by,
 * stripe_subscription_id and owner_user_id. `public.vendor_reviews` holds
 * reviewer_user_id. Reviewer identity and vendor contact data leaked four
 * separate times because a later migration re-granted the base tables to
 * anon/authenticated, silently widening earlier column-level grants back to
 * every column.
 *
 * The permanent shape is: anon has ZERO privileges on the two base tables,
 * signed-in members hold only the privileges their row rules already scope to
 * their own records, public reads go through vendors_public /
 * vendor_reviews_public, and the safe views never project sensitive columns.
 * These tests fail loudly if a future edit breaks any part of that.
 */

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

/** The migration that established the locked-down shape. Anything that grants
 *  the base tables to anon/authenticated after this file is a regression. */
const LOCKDOWN_MIGRATION_PREFIX = "20260813";

const SENSITIVE_COLUMNS = [
  "email",
  "phone",
  "review_notes",
  "reviewed_by",
  "reviewed_at",
  "stripe_subscription_id",
  "owner_user_id",
  "reviewer_user_id",
];

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function readMigration(file: string): string {
  return readFileSync(join(MIGRATIONS_DIR, file), "utf8");
}

/**
 * Strip SQL comments and quoted string literals, so the deliberate warning text
 * in the COMMENT ON statements (which quotes the forbidden GRANT) is not itself
 * flagged as a forbidden GRANT.
 */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .replace(/\$\$[\s\S]*?\$\$/g, " '' ")
    .replace(/'(?:[^']|'')*'/g, " '' ");
}

describe("vendor privacy lockdown: migrations", () => {
  it("no migration after the lockdown grants the base tables to anon or PUBLIC", () => {
    const offenders: string[] = [];
    for (const file of migrationFiles()) {
      if (file < LOCKDOWN_MIGRATION_PREFIX) continue;
      const sql = stripSqlComments(readMigration(file));
      const grants = sql.match(/grant[\s\S]{0,400}?;/gi) ?? [];
      for (const stmt of grants) {
        const flat = stmt.replace(/\s+/g, " ").toLowerCase();
        const touchesBaseTable =
          /\bon\s+(public\.)?vendors\b(?!_public)/.test(flat) ||
          /\bon\s+(public\.)?vendor_reviews\b(?!_public)/.test(flat);
        // `authenticated` is allowed again as of 20260905: the row rules on both
        // tables restrict a signed-in member to their own vendor profile and
        // their own reviews, and without the grant those rules are unreachable
        // and every query is refused. `anon` and PUBLIC stay permanently locked:
        // public reads go through vendors_public / vendor_reviews_public.
        const touchesPublicRole = /\b(anon|public)\b/.test(flat.split(" to ")[1] ?? "");
        if (touchesBaseTable && touchesPublicRole) offenders.push(`${file}: ${flat.trim()}`);
      }
    }
    expect(
      offenders,
      "A migration grants privileges on the PRIVACY LOCKED vendors / vendor_reviews base tables to anon, authenticated or PUBLIC. " +
        "This is exactly how reviewer identities and vendor contact data were re-exposed before. " +
        "Grant public access on vendors_public / vendor_reviews_public instead.",
    ).toEqual([]);
  });

  it("the safe views never project sensitive columns", () => {
    const offenders: string[] = [];
    for (const file of migrationFiles()) {
      const sql = stripSqlComments(readMigration(file));
      const views = sql.match(/create\s+(or\s+replace\s+)?view[\s\S]*?;/gi) ?? [];
      for (const stmt of views) {
        const flat = stmt.replace(/\s+/g, " ").toLowerCase();
        if (!/(vendors_public|vendor_reviews_public)/.test(flat)) continue;
        // Only inspect the projection, not the WHERE / JOIN predicates.
        let projection = flat.split(" from ")[0] ?? "";
        // Phone and address may appear ONLY inside the vendor's explicit
        // opt-in expression (`case when show_phone then phone end as
        // public_phone`). That is the sanctioned, consent-gated exposure, so
        // strip those exact forms before checking for raw leaks.
        projection = projection
          .replace(/case\s+when\s+show_phone\s+then\s+phone\s+end\s+as\s+public_phone/g, "public_phone")
          .replace(/case\s+when\s+show_address\s+then\s+address\s+end\s+as\s+public_address/g, "public_address");
        for (const col of SENSITIVE_COLUMNS) {
          if (new RegExp(`(^|[ ,.(])${col}([ ,)]|$)`).test(projection)) {
            offenders.push(`${file}: ${col}`);
          }
        }
      }
    }
    expect(
      offenders,
      "A public vendor view projects a sensitive column. vendors_public and vendor_reviews_public are the public data boundary and must stay contact-free and identity-free.",
    ).toEqual([]);
  });
});

describe("vendor privacy lockdown: application code", () => {
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) sourceFiles(full, out);
      else if (/\.(ts|tsx)$/.test(entry.name) && entry.name !== "types.ts") out.push(full);
    }
    return out;
  }

  it("no browser-side code reads the vendors or vendor_reviews base tables", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, "src"))) {
      // Server-only modules are allowed: they use the verified service role.
      if (/\.(server|functions)\.tsx?$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (/\.from\(\s*["'](vendors|vendor_reviews)["']\s*\)/.test(line)) {
          offenders.push(`${file.replace(ROOT + "/", "")}:${i + 1}`);
        }
      });
    }
    expect(
      offenders,
      "Client-reachable code queries a PRIVACY LOCKED base table. anon and authenticated have no privileges there, so this read fails and, if it were ever re-granted, would leak vendor contact data or reviewer identities. Use vendors_public / vendor_reviews_public, or a server function that verifies the caller.",
    ).toEqual([]);
  });

  it("the public marketplace reads go through the safe views", () => {
    const text = readFileSync(join(ROOT, "src", "lib", "vendors.functions.ts"), "utf8");
    expect(text).toContain('.from("vendors_public")');
    expect(text).toContain('.from("vendor_reviews_public")');
  });
});
