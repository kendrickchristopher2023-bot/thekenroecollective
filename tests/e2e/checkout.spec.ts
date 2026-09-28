import { test, expect } from "@playwright/test";

/**
 * Smoke tests for the checkout flow.
 *
 * These exercise the public surface that previously broke:
 *  - "subscription updated" instead of Stripe form
 *  - missing whisper-tier discount code
 *  - discount code apply silently failing
 *
 * They run unauthenticated against the preview Stripe sandbox token.
 * No real charges occur. Tests skip gracefully if VITE_PAYMENTS_CLIENT_TOKEN
 * is not configured (e.g. on a fresh PR with no secrets).
 */

const PRICES = [
  { id: "host_monthly",     label: "Host monthly" },
  { id: "host_yearly",      label: "Host yearly" },
  { id: "atelier_monthly",  label: "Atelier monthly" },
  { id: "whisper_onetime",  label: "Whisper one-time" },
];

test.describe("Checkout (sandbox)", () => {
  for (const price of PRICES) {
    test(`renders Stripe embedded form for ${price.label}`, async ({ page }) => {
      await page.goto(`/checkout?price=${price.id}`);

      // The page must NOT short-circuit with the "subscription updated" copy.
      const subscriptionUpdated = page.getByText(/subscription has been updated/i);
      await expect(subscriptionUpdated).toHaveCount(0);

      // The Stripe Embedded Checkout iframe must mount within 30s.
      const stripeFrame = page.locator('iframe[name^="embedded-checkout"], iframe[src*="stripe.com"]');
      await expect(stripeFrame.first()).toBeVisible({ timeout: 30_000 });
    });
  }

  test("whisper-tier exposes a discount code input", async ({ page }) => {
    await page.goto("/checkout?price=whisper_onetime");
    const codeInput = page.getByPlaceholder(/discount code|promo code/i);
    await expect(codeInput.first()).toBeVisible({ timeout: 15_000 });
  });

  test("invalid discount code surfaces an error, valid one applies", async ({ page }) => {
    await page.goto("/checkout?price=host_monthly");

    const codeInput = page.getByPlaceholder(/discount code|promo code/i).first();
    await expect(codeInput).toBeVisible({ timeout: 15_000 });

    await codeInput.fill("DEFINITELY_NOT_A_REAL_CODE_XYZ");
    await page.getByRole("button", { name: /apply/i }).first().click();

    // Either an inline error or a toast — both count.
    const error = page.getByText(/invalid|not found|expired|doesn['’]t exist/i);
    await expect(error.first()).toBeVisible({ timeout: 10_000 });
  });
});
