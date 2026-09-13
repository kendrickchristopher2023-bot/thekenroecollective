// The live problem log must describe the live site only. Fourteen of eighteen
// reports in the largest group were the development preview, which sent us
// chasing a phantom, so this is locked in.
import { describe, expect, it } from "vitest";
import { classifyLogEnvironment, isLoggableEnvironment } from "@/lib/log-environment";

describe("log environment", () => {
  it("records the live site and the custom domains", () => {
    for (const host of [
      "thekenroecollective.com",
      "www.kenroecollective.com",
      "thekenroecollective.lovable.app",
    ]) {
      expect(classifyLogEnvironment(host)).toBe("production");
      expect(isLoggableEnvironment(host)).toBe(true);
    }
  });

  it("records the demo site, because customers are shown it", () => {
    expect(isLoggableEnvironment("demo.thekenroecollective.com")).toBe(true);
  });

  it("never records the development preview or a local build", () => {
    for (const host of [
      "id-preview--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app",
      "project--c5d156bb-dev.lovable.app",
      "localhost:8080",
      "127.0.0.1:8080",
    ]) {
      expect(isLoggableEnvironment(host)).toBe(false);
    }
  });

  it("treats an unknown host as live rather than dropping the report", () => {
    expect(isLoggableEnvironment(null)).toBe(true);
  });
});
