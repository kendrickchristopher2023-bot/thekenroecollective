import { describe, it, expect } from "vitest";
import { isIgnorable, isStaleBuildError } from "@/lib/error-capture-client";

describe("error capture classification", () => {
  it("treats stale-bundle server function ids as a stale build", () => {
    expect(
      isStaleBuildError(
        new Error(
          "Invalid server function ID: src_lib_rfq_functions_ts--createRfq_createServerFn_handler",
        ),
      ),
    ).toBe(true);
    expect(isStaleBuildError("Invalid server function ID: anything")).toBe(true);
  });

  it("does not misclassify real failures as stale builds", () => {
    expect(isStaleBuildError(new Error("Failed to fetch"))).toBe(false);
    expect(isStaleBuildError(new Error("Seroval Error (step: 3)"))).toBe(false);
    expect(isStaleBuildError(null)).toBe(false);
  });

  it("keeps genuine network and serialization failures loggable", () => {
    expect(isIgnorable("Failed to fetch")).toBe(false);
    expect(isIgnorable("Seroval Error (step: 3)")).toBe(false);
  });

  it("filters only known benign browser noise", () => {
    expect(isIgnorable("ResizeObserver loop completed with undelivered notifications")).toBe(true);
  });
});
