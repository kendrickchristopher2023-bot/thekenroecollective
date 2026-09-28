import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TEMPLATES, defaultContentFor, pagesOf } from "@/lib/design-templates";
import { DesignSvg } from "@/lib/design-render";

// The studio template picker renders a live thumbnail per template. Every
// template must render on its own default content without throwing.
describe("template thumbnails", () => {
  it("renders every template's first page from default content", () => {
    for (const t of TEMPLATES) {
      const html = renderToStaticMarkup(
        <DesignSvg template={t} content={defaultContentFor(t)} page={pagesOf(t)[0]} />,
      );
      expect(html, t.id).toContain("<svg");
    }
  });
});
