import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { TEMPLATES } from "@/lib/email-templates/registry";

describe("email registry", () => {
  it("registers every template used by senders", () => {
    for (const n of ["event-announcement","well-wishes-digest","bring-sheet-nudge","thank-you-card"]) {
      expect(TEMPLATES[n], n).toBeTruthy();
    }
  });
  it("renders the announcement template", async () => {
    const t = TEMPLATES["event-announcement"]!;
    const html = await render(React.createElement(t.component as any, t.previewData ?? {}));
    expect(html).toContain("Glass Pavilion");
  });
});
