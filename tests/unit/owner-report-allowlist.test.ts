import { describe, it, expect } from "vitest";
import { isOwnerReportEmail, OWNER_REPORT_ALLOWLIST } from "@/lib/owner-report-access";
describe("allowlist", () => {
  it("allows the five accounts, case and space insensitive", () => {
    expect(OWNER_REPORT_ALLOWLIST.length).toBe(5);
    for (const e of OWNER_REPORT_ALLOWLIST) expect(isOwnerReportEmail(` ${e.toUpperCase()} `)).toBe(true);
  });
  it("denies others", () => {
    expect(isOwnerReportEmail("admin@example.com")).toBe(false);
    expect(isOwnerReportEmail(null)).toBe(false);
  });
});
