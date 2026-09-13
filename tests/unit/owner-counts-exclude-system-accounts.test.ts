/**
 * The demo host and the sample-wedding account are ours. If either is counted,
 * the owner's numbers say we have customers we do not have, and a fake plan
 * shows up as revenue. getDemoUserIds() returns both, so every counting path
 * must filter on it, and the analytics summaries must pass the whole list
 * rather than one id.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("analytics summaries leave out every system account", () => {
  const fns = read("src/lib/owner-analytics.functions.ts");

  it("calls the array version of both summaries", () => {
    expect(fns).toContain("owner_analytics_snapshot_v3");
    expect(fns).toContain("owner_contacts_snapshot_v3");
    expect(fns).not.toContain("snapshot_v2");
  });

  it("passes the whole list of system accounts, not one id", () => {
    expect(fns).toContain("_exclude_user_ids: scope.excludeUserIds");
    expect(fns).not.toContain("_exclude_user_id:");
  });
});

describe("owner lists and counts filter on getDemoUserIds", () => {
  const files = [
    "src/lib/owner-users.functions.ts",
    "src/lib/owner-subscriptions.functions.ts",
    "src/lib/owner-report.server.ts",
    "src/lib/owner-issues.server.ts",
    "src/lib/owner-issues-actions.server.ts",
    "src/lib/owner-ai-tools.server.ts",
    "src/lib/projects-admin.server.ts",
  ];

  it.each(files)("%s excludes system accounts", (file) => {
    expect(read(file)).toContain("getDemoUserIds");
  });

  it("takes system accounts out of the user directory and its total", () => {
    const s = read("src/lib/owner-users.functions.ts");
    expect(s).toContain("everyone.filter((u) => !systemIds.has(u.id))");
    expect(s).toContain("total: rows.length");
  });

  it("takes system-account plans out of the subscriptions list", () => {
    expect(read("src/lib/owner-subscriptions.functions.ts")).toContain(
      "filter((s) => !systemIds.has(s.user_id))",
    );
  });

  it("filters the report on the account column of each table", () => {
    const s = read("src/lib/owner-report.server.ts");
    for (const col of ['notDemo("organizer_user_id")', 'notDemo("user_id")', 'notDemo("owner_user_id")', 'notDemo("created_by")']) {
      expect(s).toContain(col);
    }
    // Messages on cards carry no account column, so they are netted off by card id.
    expect(s).toContain("countDemoFreeContributions");
  });

  it("filters the project console by owner", () => {
    expect(read("src/lib/projects-admin.server.ts")).toContain('withoutAccounts(query as any, "owner_user_id", systemIds)');
  });

  it("filters every AI analyst count that names an account", () => {
    const s = read("src/lib/owner-ai-tools.server.ts");
    expect(s).toContain("withoutSystemAccounts");
    // support tickets, plans, churn, accounts, refunds, events
    expect(s.match(/withoutSystemAccounts\(/g)?.length ?? 0).toBeGreaterThanOrEqual(7);
  });
});

describe("the demo environment still sees its own data", () => {
  it("sends no exclusion list when the request is the demo site", () => {
    const s = read("src/lib/demo-accounts.server.ts");
    expect(s).toContain("excludeUserIds: isDemo ? [] : all");
    const fns = read("src/lib/owner-analytics.functions.ts");
    expect(fns).toContain("scope.excludeUserIds.length ? scope.excludeUserIds : null");
  });
});
