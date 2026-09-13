import { describe, expect, it, vi } from "vitest";
import { accountAddonAccess } from "@/lib/addon-access.server";

function client({ owner = false, tier = "postcard", converter = false } = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      tier,
      guest_import_enabled: false,
      thank_you_cards_enabled: false,
      converter_enabled: converter,
    },
  });
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    maybeSingle,
  };
  return {
    rpc: vi.fn().mockImplementation((_name: string, args: { _role: string }) =>
      Promise.resolve({ data: args._role === "owner" ? owner : false }),
    ),
    from: vi.fn(() => chain),
  };
}

describe("account add-on access", () => {
  it("allows a non-owner Atelier account to use the converter", async () => {
    expect(await accountAddonAccess(client({ tier: "atelier" }), "user-1", "converter")).toBe(true);
  });

  it("allows a purchased converter unlock below Atelier", async () => {
    expect(await accountAddonAccess(client({ converter: true }), "user-2", "converter")).toBe(true);
  });

  it("blocks an ordinary account without the unlock", async () => {
    expect(await accountAddonAccess(client(), "user-3", "converter")).toBe(false);
  });
});