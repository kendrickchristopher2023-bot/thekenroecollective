import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import { template as wellWishes } from "@/lib/email-templates/well-wishes-digest";
import { template as ecardDelivery } from "@/lib/email-templates/ecard-delivery";
import { sanitizeEmailImageData } from "@/lib/email/image-url";

const COVER = "https://thekenroecollective.com/cover.jpg";

describe("preview must equal delivery: media reaches the inbox", () => {
  it("well-wishes digest renders the event cover, letterboxed", async () => {
    const W = wellWishes.component as any;
    const html = await render(<W eventTitle="Layla turns 40" coverImage={COVER} wishes={[{ name: "Nina", message: "hi" }]} />);
    expect(html).toContain(COVER);
    expect(html).toContain('alt="Layla turns 40"');
    expect(html).toMatch(/object-fit:\s*contain/);
  });

  it("well-wishes digest still renders with no cover at all", async () => {
    const W = wellWishes.component as any;
    const html = await render(<W eventTitle="Layla turns 40" wishes={[{ name: "Nina", message: "hi" }]} />);
    expect(html).toContain("Layla turns 40");
    expect(html).not.toContain("<img");
  });

  it("drops a browser-only cover before it can silently vanish in the inbox", () => {
    const { data, dropped } = sanitizeEmailImageData({ coverImage: "blob:http://x/y", eventTitle: "t" });
    expect(dropped).toEqual(["coverImage"]);
    expect(data.coverImage).toBeUndefined();
  });

  it("eCard delivery renders up to three pictures and names unplayable media", async () => {
    const E = ecardDelivery.component as any;
    const imgs = [1, 2, 3, 4].map((n) => `https://thekenroecollective.com/p${n}.jpg`);
    const html = await render(
      <E recipientName="Priya" previewImages={imgs} extraMediaNote="There are also 2 voice notes waiting for you on the page." />,
    );
    for (const u of imgs.slice(0, 3)) expect(html).toContain(u);
    expect(html).not.toContain(imgs[3]);
    expect(html).toContain("2 voice notes");
    expect(html).toMatch(/object-fit:\s*contain/);
  });
});
