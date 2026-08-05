import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@repo/core";

const mocks = vi.hoisted(() => ({
  hasNonTerminalStripeSubscription: vi.fn(),
  getCustomerByOrg: vi.fn(),
  subscriptionsList: vi.fn(),
  checkoutSessionsList: vi.fn(),
  checkoutSessionsCreate: vi.fn(),
}));

vi.mock("../../lib/runtime-config", () => ({
  getRuntimeConfig: async () => ({
    BILLING_ENABLED: true,
    BILLING_TOPUPS_ENABLED: false,
    STRIPE_PRICE_PRO_MONTHLY_ID: "price_pro_monthly",
    STRIPE_PRICE_PRO_ANNUAL_ID: "price_pro_annual",
    STRIPE_PRICE_PRO_MONTHLY_PROMOTIONAL_ID: "",
    STRIPE_PRICE_PRO_ANNUAL_PROMOTIONAL_ID: "",
  }),
}));

vi.mock("./billing.repository", () => ({
  hasNonTerminalStripeSubscription: mocks.hasNonTerminalStripeSubscription,
  getCustomerByOrg: mocks.getCustomerByOrg,
}));

vi.mock("../../lib/stripe-client", () => ({
  stripe: async () => ({
    subscriptions: { list: mocks.subscriptionsList },
    checkout: {
      sessions: {
        list: mocks.checkoutSessionsList,
        create: mocks.checkoutSessionsCreate,
      },
    },
  }),
}));

vi.mock("./billing.webhooks", () => ({ handleStripeEvent: vi.fn() }));

import { createCheckoutSession } from "./billing.service";

const ctx = {
  organizationId: "org_test",
  user: { email: "owner@example.com" },
} as Parameters<typeof createCheckoutSession>[0];

describe("subscription Checkout duplicate-charge protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasNonTerminalStripeSubscription.mockResolvedValue(false);
    mocks.getCustomerByOrg.mockResolvedValue({
      stripeCustomerId: "cus_test",
    });
    mocks.subscriptionsList.mockResolvedValue({ data: [] });
    mocks.checkoutSessionsList.mockResolvedValue({ data: [] });
    mocks.checkoutSessionsCreate.mockResolvedValue({ url: "https://checkout.test/new" });
  });

  it("rejects before calling Stripe when the local ledger has a non-terminal subscription", async () => {
    mocks.hasNonTerminalStripeSubscription.mockResolvedValue(true);

    const error = await createCheckoutSession(ctx, "pro", "monthly").catch((err) => err);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("BILLING_SUBSCRIPTION_ALREADY_EXISTS");
    expect(mocks.subscriptionsList).not.toHaveBeenCalled();
    expect(mocks.checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("rejects when Stripe has a non-terminal subscription missing from the local ledger", async () => {
    mocks.subscriptionsList.mockResolvedValue({ data: [{ status: "active" }] });

    const error = await createCheckoutSession(ctx, "pro", "annual").catch((err) => err);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("BILLING_SUBSCRIPTION_ALREADY_EXISTS");
    expect(mocks.checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("reuses an open Checkout session for the same selected interval", async () => {
    mocks.checkoutSessionsList.mockResolvedValue({
      data: [
        {
          mode: "subscription",
          url: "https://checkout.test/existing",
          metadata: {
            organizationId: "org_test",
            planTierId: "pro",
            interval: "monthly",
          },
        },
      ],
    });

    await expect(createCheckoutSession(ctx, "pro", "monthly")).resolves.toEqual({
      checkoutUrl: "https://checkout.test/existing",
    });
    expect(mocks.checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("refuses to silently reuse an open Checkout for a different interval", async () => {
    mocks.checkoutSessionsList.mockResolvedValue({
      data: [
        {
          mode: "subscription",
          url: "https://checkout.test/existing",
          metadata: {
            organizationId: "org_test",
            planTierId: "pro",
            interval: "monthly",
          },
        },
      ],
    });

    const error = await createCheckoutSession(ctx, "pro", "annual").catch((err) => err);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("BILLING_CHECKOUT_ALREADY_OPEN");
    expect(mocks.checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("creates one short-lived Checkout when no subscription or open session exists", async () => {
    await expect(createCheckoutSession(ctx, "pro", "annual")).resolves.toEqual({
      checkoutUrl: "https://checkout.test/new",
    });

    const [params, options] = mocks.checkoutSessionsCreate.mock.calls[0];
    expect(params.line_items).toEqual([{ price: "price_pro_annual", quantity: 1 }]);
    expect(params.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000) + 29 * 60);
    expect(options.idempotencyKey).toContain("checkout-sub:org_test:pro:");
    expect(options.idempotencyKey).not.toContain("annual");
  });
});
