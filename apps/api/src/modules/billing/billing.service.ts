/**
 * Billing service — Stripe outbound API (checkout, portal) for cloud pricing.
 *
 * The inbound webhook side lives in `billing.webhooks.ts`; the DB-only
 * ledger lives in `billing.repository.ts`. This module is the thin
 * adapter between controllers and Stripe's REST surface.
 *
 * Self-hosted instances never load this — billing routes are mounted
 * only under CLOUD_MODE (see `billing.routes.ts`).
 */

import {
  AppError,
  PLANS,
  CREDIT_PACKS,
  isPlaceholderPriceId,
  resolveDashboardPageUrl,
  safeErrorMessage,
  type PlanTierId,
} from "@repo/core";
import { db, schema, eq, asc, desc } from "@repo/db";
import { runtimeTarget } from "../../config/env";
import type { RequestContext } from "../../lib/request-context";
import { stripe } from "../../lib/stripe-client";
import { handleStripeEvent as handleStripeWebhook } from "./billing.webhooks";
import * as billingRepository from "./billing.repository";
import { getRuntimeConfig } from "../../lib/runtime-config";

/* ---------- Feature gate (master switch, cloud-owned) ---------- */

/**
 * The ONE server-side gate for "is the billing feature live". Every
 * Stripe-mutating path funnels through here so billing can be turned on by
 * flipping `BILLING_ENABLED` on the SaaS — with no dashboard or self-hosted
 * release. Fails CLOSED (403) when off, so a stale/racing client that still
 * shows a buy button can't start a real Stripe session. Read paths (state,
 * usage, plans) deliberately do NOT call this — the dashboard still renders the
 * "coming soon" surface and live usage/capacity while billing is disabled.
 */
export async function assertBillingEnabled(): Promise<void> {
  if (!(await getRuntimeConfig()).BILLING_ENABLED) {
    throw new AppError(
      "Billing is not enabled yet. It's coming soon to Vibrail Cloud.",
      403,
      "BILLING_NOT_ENABLED",
    );
  }
}

/** Top-ups gate — requires the master billing switch AND the top-ups sub-switch. */
export async function assertTopupsEnabled(): Promise<void> {
  await assertBillingEnabled();
  if (!(await getRuntimeConfig()).BILLING_TOPUPS_ENABLED) {
    throw new AppError(
      "One-time credit top-ups are not available yet.",
      403,
      "BILLING_TOPUPS_NOT_ENABLED",
    );
  }
}

/* ---------- Idempotency key helpers ---------- */

/**
 * Per-minute idempotency bucket for Stripe mutations the caller may
 * retry on transient failures (network, our own 5xx). Within a one-
 * minute window, retries collapse onto the same Stripe object; after
 * the window, callers get a fresh idempotency key — appropriate for
 * "user double-clicked Upgrade" but not for "Stripe replayed a
 * webhook three days later" (those are guarded by other tables).
 *
 * Format: `<flow>:<orgId>:<resource>:<yyyymmddhhmm>` so the key is
 * stable for retries inside the window AND visible to operators in
 * the Stripe dashboard's idempotency log.
 */
function minuteBucket(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${d}${h}${mi}`;
}

function flowKey(flow: string, orgId: string, resource: string): string {
  return `${flow}:${orgId}:${resource}:${minuteBucket()}`;
}

/* ---------- Customer resolution ---------- */

/**
 * Resolve the Stripe customer id for an org, creating one if needed.
 *
 * The DB row is a cache; subsequent checkout/portal flows skip the
 * network round-trip. Idempotent against concurrent first-time
 * checkouts: `customers.create` is sent with `idempotencyKey =
 * "customer:<orgId>"`, so two requests in the TOCTOU window between
 * `getCustomerByOrg` and `customers.create` collapse into ONE Stripe
 * customer instead of minting duplicates. The org gets exactly one
 * Stripe customer for its lifetime, hence no time bucket on this key.
 *
 * The webhook handler treats Stripe as the source of truth and
 * overwrites the cache, so a manual deletion of the row self-heals
 * on the next event.
 */
async function getOrCreateStripeCustomerId(
  organizationId: string,
  email: string | undefined,
): Promise<string> {
  const existing = await billingRepository.getCustomerByOrg(organizationId);
  if (existing) return existing.stripeCustomerId;

  const customer = await (await stripe()).customers.create(
    {
      email,
      metadata: { organizationId },
    },
    // Stable per-org key — org gets exactly ONE Stripe customer over its
    // lifetime, no time bucket. Concurrent first-time checkouts collapse
    // onto a single Stripe.Customer instead of minting duplicates.
    { idempotencyKey: `customer:${organizationId}` },
  );
  await billingRepository.upsertCustomer({
    orgId: organizationId,
    stripeCustomerId: customer.id,
    email: email ?? "",
  });
  return customer.id;
}

/* ---------- Checkout: subscription ---------- */

/**
 * Recurring-subscription checkout for a tier upgrade.
 *
 * The Stripe price id is looked up from the static PLANS catalog via
 * `(planTierId, interval)`. Free + enterprise rows have null prices and
 * are rejected here — free is implicit (no checkout) and enterprise is
 * contract-sales.
 *
 * Metadata is attached at TWO levels: on the session itself (so
 * `checkout.session.completed` can attribute the event to the org) and
 * on the subscription (so subsequent `customer.subscription.*` events
 * carry the same attribution without re-reading the session).
 */
export async function createCheckoutSession(
  ctx: RequestContext,
  planTierId: PlanTierId,
  interval: "monthly" | "annual",
): Promise<{ checkoutUrl: string }> {
  await assertBillingEnabled();
  const organizationId = ctx.organizationId;
  const email = ctx.user.email;
  const plan = PLANS[planTierId];
  const runtimeConfig = await getRuntimeConfig();
  const amountDollars =
    planTierId === "pro"
      ? interval === "annual"
        ? runtimeConfig.STRIPE_PRICE_PRO_ANNUAL_PROMOTIONAL > 0
          ? runtimeConfig.STRIPE_PRICE_PRO_ANNUAL_PROMOTIONAL
          : runtimeConfig.STRIPE_PRICE_PRO_ANNUAL
        : runtimeConfig.STRIPE_PRICE_PRO_PROMOTIONAL > 0
          ? runtimeConfig.STRIPE_PRICE_PRO_PROMOTIONAL
          : runtimeConfig.STRIPE_PRICE_PRO_MONTHLY
      : null;

  if (amountDollars === null) {
    throw new AppError(
      `Plan ${planTierId} (${interval}) is not purchasable`,
      400,
      "BILLING_PLAN_NOT_PURCHASABLE",
    );
  }

  const customerId = await getOrCreateStripeCustomerId(organizationId, email);

  const session = await (await stripe()).checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      client_reference_id: organizationId,
      metadata: { organizationId, planTierId, interval },
      subscription_data: {
        metadata: { organizationId, planTierId, interval },
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amountDollars * 100),
            recurring: { interval: interval === "annual" ? "year" : "month" },
            product_data: { name: `${plan.name} plan` },
          },
          quantity: 1,
        },
      ],
      success_url: resolveDashboardPageUrl(
        runtimeTarget.dashboard,
        "/billing/overview?checkout=success",
      ),
      cancel_url: resolveDashboardPageUrl(
        runtimeTarget.dashboard,
        "/billing/plans?checkout=cancelled",
      ),
    },
    {
      idempotencyKey: flowKey("checkout-sub", organizationId, `${planTierId}-${interval}`),
    },
  );

  if (!session.url) {
    throw new Error("Failed to create checkout session");
  }

  return { checkoutUrl: session.url };
}

/* ---------- Checkout: one-shot top-up ---------- */

/**
 * One-shot top-up checkout for a credit pack. `mode: "payment"` (not
 * "subscription") since a pack is a single purchase, not recurring.
 *
 * The pack row is validated against `CREDIT_PACKS` (the canonical
 * catalog) and surfaced via `stripePriceId`. The webhook handler uses
 * `metadata.packId` to dereference the same constant on the inbound
 * side and mint the topup grant.
 */
export async function createTopupCheckoutSession(
  ctx: RequestContext,
  packId: string,
): Promise<{ checkoutUrl: string }> {
  await assertTopupsEnabled();
  const organizationId = ctx.organizationId;
  const email = ctx.user.email;
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) {
    throw new AppError(`Unknown top-up pack: ${packId}`, 404, "BILLING_PACK_NOT_FOUND");
  }
  if (!pack.stripePriceId || isPlaceholderPriceId(pack.stripePriceId)) {
    throw new AppError(
      "Billing is not configured for this plan tier",
      503,
      "BILLING_NOT_CONFIGURED",
    );
  }

  const customerId = await getOrCreateStripeCustomerId(organizationId, email);

  const session = await (await stripe()).checkout.sessions.create(
    {
      mode: "payment",
      customer: customerId,
      client_reference_id: organizationId,
      metadata: { organizationId, packId },
      payment_intent_data: {
        metadata: { organizationId, packId },
      },
      line_items: [{ price: pack.stripePriceId, quantity: 1 }],
      success_url: resolveDashboardPageUrl(
        runtimeTarget.dashboard,
        "/billing/overview?topup=success",
      ),
      cancel_url: resolveDashboardPageUrl(
        runtimeTarget.dashboard,
        "/billing/overview?topup=cancelled",
      ),
    },
    { idempotencyKey: flowKey("checkout-topup", organizationId, packId) },
  );

  if (!session.url) {
    throw new Error("Failed to create top-up checkout session");
  }

  return { checkoutUrl: session.url };
}

/* ---------- Portal ---------- */

/**
 * Stripe-hosted customer portal — Stripe owns the invoice list, the
 * payment-method UI, and the cancellation flow. We just hand them a
 * one-shot redirect URL bound to this org's customer.
 *
 * Organizations granted a plan manually may not have gone through Checkout
 * yet. Resolve the customer lazily here so those users can still open the
 * portal and add a payment method; creating the customer does not create a
 * subscription or charge the user.
 */
export async function createPortalSession(
  organizationId: string,
  email: string | undefined,
): Promise<{ portalUrl: string }> {
  await assertBillingEnabled();
  const customerId = await getOrCreateStripeCustomerId(organizationId, email);

  const session = await (await stripe()).billingPortal.sessions.create(
    {
      customer: customerId,
      return_url: resolveDashboardPageUrl(runtimeTarget.dashboard, "/billing/overview"),
    },
    { idempotencyKey: flowKey("portal", organizationId, "session") },
  );

  return { portalUrl: session.url };
}

/* ---------- Cancellation ---------- */

/**
 * Flip `cancel_at_period_end=true` on the org's Stripe subscription.
 * Stripe still charges through the end of the current period and fires
 * `customer.subscription.deleted` on rollover — the webhook downgrades
 * the local row + tier when that event lands.
 *
 * Returns the period end so the dashboard can render "Cancels on …"
 * without a follow-up read. The local subscription row is mirrored
 * immediately so a refresh right after this call shows the new state.
 */
export async function cancelSubscription(
  organizationId: string,
): Promise<{ cancelAt: Date | null }> {
  await assertBillingEnabled();
  const [sub] = await db
    .select()
    .from(schema.billingSubscription)
    .where(eq(schema.billingSubscription.organizationId, organizationId))
    .orderBy(desc(schema.billingSubscription.createdAt))
    .limit(1);

  if (!sub || sub.status === "canceled") {
    throw new AppError("No active subscription to cancel", 404, "BILLING_SUBSCRIPTION_NOT_FOUND");
  }

  const updated = await (await stripe()).subscriptions.update(
    sub.stripeSubscriptionId,
    { cancel_at_period_end: true },
    {
      idempotencyKey: flowKey("sub-cancel-at-period-end", organizationId, sub.stripeSubscriptionId),
    },
  );

  await billingRepository
    .upsertSubscription({
      organizationId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      stripePriceId: sub.stripePriceId,
      planTierId: sub.planTierId as PlanTierId,
      interval: sub.interval as "monthly" | "annual",
      status: updated.status,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: true,
    })
    .catch((err) =>
      console.warn("[billing] local mirror of cancel-at-period-end failed:", safeErrorMessage(err)),
    );

  return { cancelAt: sub.currentPeriodEnd };
}

/* ---------- Credit packs (catalog) ---------- */

/**
 * Active top-up packs surfaced in the dashboard. Reads off the
 * `credit_pack` table — the synced state of the `CREDIT_PACKS` constant
 * after the boot syncer runs (`syncCreditPacksFromConstants`).
 * Inactive rows (packs removed from the catalog) are filtered out
 * server-side so the client never has to.
 */
export async function listActiveCreditPacks() {
  return db
    .select()
    .from(schema.creditPack)
    .where(eq(schema.creditPack.active, true))
    .orderBy(asc(schema.creditPack.sortOrder));
}

/* ---------- Webhook (re-export) ---------- */

/**
 * Stripe webhook entry point. Delegates to billing.webhooks for the
 * actual dispatch + per-event handlers. Re-exported here so the
 * controller's import path doesn't need to change.
 */
export const handleStripeEvent = handleStripeWebhook;
