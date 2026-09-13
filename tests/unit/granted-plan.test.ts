import { describe, expect, it } from "vitest";
import { isGrantedPlan } from "@/lib/granted-plan";

describe("isGrantedPlan", () => {
  it("flags comped rows created by the manual grant path", () => {
    expect(
      isGrantedPlan({
        stripe_customer_id: "manual_cust_97f3faca",
        stripe_subscription_id: "manual_dc78f6c3",
        product_id: "manual_atelier",
      }),
    ).toBe(true);
  });

  it("flags rows where only one id is synthetic", () => {
    expect(isGrantedPlan({ stripe_customer_id: "cus_123", product_id: "manual_atelier" })).toBe(true);
    expect(
      isGrantedPlan({ stripe_customer_id: "cus_123", stripe_subscription_id: "manual_comp_x" }),
    ).toBe(true);
  });

  it("leaves real purchased subscriptions alone", () => {
    expect(
      isGrantedPlan({
        stripe_customer_id: "cus_UqyAxqcWg65cS6",
        stripe_subscription_id: "sub_1TrXMmE6Stv4awjGAyTovlnO",
        product_id: "prod_UjCWHaiomAYI2c",
      }),
    ).toBe(false);
  });

  it("is false with no subscription", () => {
    expect(isGrantedPlan(null)).toBe(false);
  });
});
