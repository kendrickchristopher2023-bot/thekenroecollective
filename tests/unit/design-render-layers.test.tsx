import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DesignSvg } from "@/lib/design-render";
import { TEMPLATES, pagesOf } from "@/lib/design-templates";
const ff = [
  { id: "a", type: "emoji" as const, x: 80, y: 300, w: 80, h: 80, text: "✨", fontSize: 64 },
  { id: "b", type: "text" as const, x: 60, y: 400, w: 240, h: 56, text: "JoinUs", fontSize: 32, color: "#111" },
  { id: "c", type: "rect" as const, x: 300, y: 300, w: 100, h: 60, fill: "#3B82F6" },
];
describe("every template paints overlays + freeform", () => {
  for (const t of TEMPLATES) {
    for (const page of pagesOf(t)) {
      it(`${t.id} / ${page}`, () => {
        const content: any = {
          ...Object.fromEntries(t.fields.map((f) => [f.key, f.defaultValue])),
          freeform: { [page]: ff },
          background: { pattern: "dots", image: "https://example.com/x.jpg", fit: "cover" },
        };
        const html = renderToStaticMarkup(<DesignSvg template={t} content={content} page={page} />);
        expect(html, "freeform text").toContain("JoinUs");
        expect(html, "freeform layer").toContain("data-ff-layer");
        expect(html, "pattern").toContain("__bgpat");
        expect(html, "bg image").toContain("example.com/x.jpg");
        if (t.kind === "apparel") expect(html, "clip").toContain("__shirtclip");
      });
    }
  }
});
