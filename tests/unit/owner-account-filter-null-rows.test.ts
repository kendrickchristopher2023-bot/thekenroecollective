import { describe, expect, it } from "vitest";
import { excludeAccountsFilter, keepsRow, withoutAccounts } from "@/lib/owner-account-filter";

const DEMO = "7d036969-831d-4dd8-a219-1c493d7aacb4";
const SHOWCASE = "b72c64c1-1111-4ead-9ff1-57018eb5b38d";

/** Tiny stand-in for a PostgREST query builder that records its filters. */
function fakeQuery() {
  const calls: string[] = [];
  const q: any = {
    calls,
    or(f: string) {
      calls.push(`or:${f}`);
      return q;
    },
    not(col: string, op: string, v: string) {
      calls.push(`not:${col}:${op}:${v}`);
      return q;
    },
  };
  return q;
}

/** Evaluates the filter the way Postgres would, for a row with a given account column. */
function rowPasses(filter: string | null, value: string | null): boolean {
  if (!filter) return true;
  const cut = filter.indexOf(",");
  const isNull = filter.slice(0, cut);
  const notIn = filter.slice(cut + 1);
  const col = isNull.replace(".is.null", "");
  expect(notIn.startsWith(`${col}.not.in.(`)).toBe(true);
  const ids = notIn.slice(notIn.indexOf("(") + 1, -1).split(",");
  if (value === null) return true; // "<col> IS NULL" branch
  return !ids.includes(value);
}

describe("owner account exclusion keeps rows with no account", () => {
  it("builds an 'is null, or not in the list' expression", () => {
    expect(excludeAccountsFilter("user_id", [DEMO, SHOWCASE])).toBe(
      `user_id.is.null,user_id.not.in.(${DEMO},${SHOWCASE})`,
    );
    expect(excludeAccountsFilter("user_id", [])).toBeNull();
    expect(excludeAccountsFilter("user_id", ["not-a-uuid"])).toBeNull();
  });

  it("keeps an anonymous row and drops a demo or showcase row", () => {
    const f = excludeAccountsFilter("user_id", [DEMO, SHOWCASE]);
    expect(rowPasses(f, null)).toBe(true);
    expect(rowPasses(f, DEMO)).toBe(false);
    expect(rowPasses(f, SHOWCASE)).toBe(false);
    expect(rowPasses(f, "11111111-2222-4333-8444-555555555555")).toBe(true);
  });

  it("applies through or(), never through a bare not-in", () => {
    const q = fakeQuery();
    withoutAccounts(q, "organizer_user_id", [DEMO]);
    expect(q.calls).toEqual([`or:organizer_user_id.is.null,organizer_user_id.not.in.(${DEMO})`]);
    const q2 = fakeQuery();
    withoutAccounts(q2, "organizer_user_id", []);
    expect(q2.calls).toEqual([]);
  });

  it("in-memory rule matches: no account stays, excluded account goes", () => {
    expect(keepsRow(null, [DEMO])).toBe(true);
    expect(keepsRow(undefined, [DEMO])).toBe(true);
    expect(keepsRow(DEMO, [DEMO, SHOWCASE])).toBe(false);
    expect(keepsRow(SHOWCASE, [DEMO, SHOWCASE])).toBe(false);
    expect(keepsRow("11111111-2222-4333-8444-555555555555", [DEMO])).toBe(true);
  });
});

describe("every owner helper routes its exclusion through the shared filter", () => {
  it.each([
    ["src/lib/owner-issues.server.ts", "notSystem"],
    ["src/lib/owner-issues-actions.server.ts", "notSystem"],
    ["src/lib/owner-ai-tools.server.ts", "withoutSystemAccounts"],
    ["src/lib/owner-report.server.ts", "notDemo"],
    ["src/lib/projects-admin.server.ts", "withoutAccounts"],
  ])("%s uses withoutAccounts and no bare not-in on account columns", async (file, name) => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(file, "utf8");
    expect(src).toContain('from "@/lib/owner-account-filter"');
    expect(src).toContain(name);
    expect(src).not.toMatch(/\.not\((?:col|column|"user_id"|"owner_user_id"|"organizer_user_id")[^)]*"in"/);
  });
});
