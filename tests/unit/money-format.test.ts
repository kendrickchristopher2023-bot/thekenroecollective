import { describe, expect, it } from "vitest";
import { money } from "@/components/admin/owner-report-parts";
import { fmtUsd } from "@/lib/ai-packages-helpers";
import { formatMoney as formatCartMoney } from "@/lib/cart-catalog";
import { formatMoney as formatAiMoney } from "@/lib/owner-ai-actions";

const DATEISH = /\d{1,2}\/\d{1,2}\/(19|20)\d{2}/;

describe("owner report money()", () => {
  it("renders zero revenue as $0.00, never as a date", () => {
    expect(money(0)).toBe("$0.00");
    expect(money(0)).not.toMatch(DATEISH);
    expect(money(0)).not.toContain("1969");
  });

  it("renders cents amounts correctly", () => {
    expect(money(2500)).toBe("$25.00");
    expect(money(10600)).toBe("$106.00");
    expect(money(1)).toBe("$0.01");
    expect(money(123456789)).toBe("$1,234,567.89");
  });

  it("never renders a date for any amount", () => {
    for (const cents of [0, 1, 100, 999, 7000, -2500, 86400000]) {
      expect(money(cents)).not.toMatch(DATEISH);
    }
  });
});

describe("other money surfaces", () => {
  it("AI package pricing", () => {
    expect(fmtUsd(0)).toBe("$0.00");
    expect(fmtUsd(2500)).toBe("$25.00");
    expect(fmtUsd(null)).toBe("—");
    expect(fmtUsd(0)).not.toMatch(DATEISH);
  });

  it("cart / add-on pricing", () => {
    expect(formatCartMoney(0)).toBe("$0.00");
    expect(formatCartMoney(500)).toBe("$5.00");
    expect(formatCartMoney(0)).not.toMatch(DATEISH);
  });

  it("owner AI action amounts", () => {
    expect(formatAiMoney(0)).toBe("$0.00");
    expect(formatAiMoney(7000)).toBe("$70.00");
    expect(formatAiMoney(0)).not.toMatch(DATEISH);
  });
});
