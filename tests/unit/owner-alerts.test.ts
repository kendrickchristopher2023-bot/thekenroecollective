import { describe, expect, it, vi, beforeEach } from "vitest";
import { OWNER_ALERT_EMAILS, OWNER_ALERT_PHONE } from "@/lib/owner-alerts.config";

const sent: any[] = [];

vi.mock("@/lib/owner-alerts.server", () => ({
  sendOwnerAlert: async (args: any) => {
    sent.push(args);
  },
}));

vi.mock("@/lib/stripe.server", () => ({
  createStripeClient: () => ({
    checkout: {
      sessions: {
        listLineItems: async () => ({
          data: [{ quantity: 1, description: "eCard send fee", price: { lookup_key: "ecard_send_fee" } }],
        }),
      },
    },
  }),
}));

import { alertOwnerOfCheckout } from "@/lib/owner-alerts-payments.server";
import { TEMPLATES } from "@/lib/email-templates/registry";

describe("owner alerts config", () => {
  it("holds the owner phone and both owner emails in one place", () => {
    expect(OWNER_ALERT_PHONE).toBe("+14043580626");
    expect(OWNER_ALERT_EMAILS).toEqual([
      "kendrickchristopher@hotmail.com",
      "support@thekenroecollective.com",
    ]);
  });

  it("registers the owner-alert email template", () => {
    expect(TEMPLATES["owner-alert"]).toBeTruthy();
  });
});

describe("alertOwnerOfCheckout", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("sends an SMS plus email alert for a paid session, with venture context", async () => {
    await alertOwnerOfCheckout(
      {
        id: "cs_test_1",
        payment_status: "paid",
        amount_total: 399,
        customer_details: { email: "buyer@example.com" },
        metadata: { ecardId: "card-1" },
      },
      "live",
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].kind).toBe("payment_received");
    expect(sent[0].dedupeKey).toBe("payment:live:cs_test_1");
    expect(sent[0].title).toContain("$3.99");
    expect(sent[0].lines.join("\n")).toContain("Group eCards");
    expect(sent[0].sms).toContain("payment received $3.99");
    expect(sent[0].link).toContain("/ecards");
  });

  it("stays silent while a delayed payment is still unpaid", async () => {
    await alertOwnerOfCheckout({ id: "cs_test_2", payment_status: "unpaid" }, "live");
    expect(sent).toHaveLength(0);
  });

  it("never throws when the session payload is unusable", async () => {
    await expect(alertOwnerOfCheckout(null, "live")).resolves.toBeUndefined();
  });
});
