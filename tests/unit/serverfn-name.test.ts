import { describe, it, expect } from "vitest";
import { shortServerFnName } from "@/lib/serverfn-name";

describe("naming the failing server call", () => {
  it("turns a raw framework id into a readable module.function name", () => {
    expect(
      shortServerFnName("src_lib_rfq_functions_ts--createRfq_createServerFn_handler"),
    ).toBe("rfq.createRfq");
    expect(
      shortServerFnName(
        "src_lib_super-admin_functions_ts--banUserAsSuperAdmin_createServerFn_handler",
      ),
    ).toBe("super-admin.banUserAsSuperAdmin");
  });

  it("falls back to the source filename and never to a bare guess", () => {
    expect(shortServerFnName("src/lib/music-studio.functions.ts")).toContain("music-studio");
    expect(shortServerFnName("")).toBe("unknown");
    expect(shortServerFnName(null)).toBe("unknown");
  });

  it("stays inside the 60 character log column", () => {
    const long = shortServerFnName(
      "src_lib_a-very-long-module-name-that-keeps-going_functions_ts--someExtremelyLongFunctionName_createServerFn_handler",
    );
    expect(long.length).toBeLessThanOrEqual(50);
  });
});
