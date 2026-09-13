// Two demo leftovers: leaving the demo from the owner console signs the demo
// account out (and only the demo account), and the demo account never sees a
// guest CSV export.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEMO_ACCOUNT_EMAIL, isDemoAccountEmail } from "@/lib/demo-mode";

describe("isDemoAccountEmail", () => {
  it("matches only the shared demo account, case-insensitively", () => {
    expect(isDemoAccountEmail(DEMO_ACCOUNT_EMAIL)).toBe(true);
    expect(isDemoAccountEmail(" Demo@TheKenroeCollective.com ")).toBe(true);
    expect(isDemoAccountEmail("owner@example.com")).toBe(false);
    expect(isDemoAccountEmail(null)).toBe(false);
    expect(isDemoAccountEmail(undefined)).toBe(false);
  });
});

describe("exitDemo", () => {
  const src = readFileSync("src/lib/demo-mode.ts", "utf8");
  const body = src.slice(src.indexOf("export async function exitDemo"));

  it("signs out only when the signed-in account is the demo account", () => {
    expect(body).toContain("supabase.auth.getUser()");
    expect(body).toMatch(/if \(isDemoAccountEmail\(data\.user\?\.email\)\) await supabase\.auth\.signOut\(\)/);
    // No unconditional sign-out anywhere in the exit path.
    const unconditional = body.match(/^\s*await supabase\.auth\.signOut\(\);?$/m);
    expect(unconditional).toBeNull();
  });

  it("still clears the cookie and returns home afterwards", () => {
    expect(body).toContain("setDemoCookie(false)");
    expect(body).toContain('window.location.replace("/")');
  });

  it("is what the owner console's Exit demo button calls", () => {
    const owner = readFileSync("src/routes/_authenticated/owner.tsx", "utf8");
    expect(owner).toContain("onClick={() => exitDemo()}");
  });
});

describe("guest CSV export in the demo", () => {
  const toolbar = readFileSync("src/components/guest-list-toolbar.tsx", "utf8");

  it("decides from the verified signed-in account or the event's demo flag, not the cookie", () => {
    expect(toolbar).toContain("const { user } = useAuthReady();");
    expect(toolbar).toContain("const canExport = !isDemoAccountEmail(user?.email) && !event._isDemo;");
    expect(toolbar).not.toContain("isDemoRuntime");
  });

  it("hides the button entirely rather than disabling it", () => {
    expect(toolbar).toMatch(/\{canExport \? \(\s*<button[\s\S]*?Export these \{visible\.length\} to CSV[\s\S]*?\) : null\}/);
  });
});
