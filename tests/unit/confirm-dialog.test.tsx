// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { confirmDialog } from "@/lib/confirm-dialog";
import { confirmRemoveMedia } from "@/lib/ecard-media-slots";

function click(text: string) {
  const btn = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  );
  if (!btn) throw new Error(`no button labelled ${text}. DOM: ${document.body.textContent}`);
  btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

async function tick() {
  await new Promise((r) => setTimeout(r, 30));
}

describe("confirmDialog", () => {
  it("renders plain-language copy and resolves true on confirm", async () => {
    const p = confirmDialog({
      title: "Remove this photo permanently?",
      body: "The photo is deleted for good.",
      confirmLabel: "Yes, delete it",
    });
    await tick();
    expect(document.body.textContent).toContain("Remove this photo permanently?");
    expect(document.body.textContent).toContain("The photo is deleted for good.");
    click("Yes, delete it");
    await expect(p).resolves.toBe(true);
  });

  it("resolves false when the guest cancels", async () => {
    const p = confirmDialog({ title: "Remove this message for good?" });
    await tick();
    click("Cancel");
    await expect(p).resolves.toBe(false);
  });

  it("uses the dialog for eCard attachment removal", async () => {
    const p = confirmRemoveMedia("audio");
    await tick();
    expect(document.body.textContent).toContain("Remove this voice note?");
    click("Cancel");
    await expect(p).resolves.toBe(false);
  });
});
