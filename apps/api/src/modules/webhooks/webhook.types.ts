/**
 * Webhook types - shared across all webhook providers.
 *
 * Every provider (GitHub, Stripe) implements the WebhookProvider interface
 * so the central dispatcher can handle verification and routing uniformly.
 */

/** Supported webhook providers */
export type WebhookProviderName = "github" | "stripe";

/** Result of verifying a webhook signature */
export interface WebhookVerifyResult {
  valid: boolean;
  error?: string;
}

/** Standardised result returned by any webhook handler */
export interface WebhookHandlerResult {
  success: boolean;
  event?: string;
  message?: string;
  error?: string;
}

/**
 * Interface every webhook provider must implement.
 *
 * `verify()` checks the cryptographic signature. Returning a Promise is
 * allowed because some providers must resolve per-resource secrets from
 * the DB before they can HMAC-check (e.g. github's per-project secret —
 * see HIGH #9 in the GitHub-auth audit).
 *
 * `handle()` parses the event and dispatches to the correct business-logic handler.
 */
export interface WebhookProvider {
  readonly name: WebhookProviderName;
  verify(
    payload: string | Buffer,
    headers: Record<string, string>,
  ): WebhookVerifyResult | Promise<WebhookVerifyResult>;
  handle(payload: unknown, headers: Record<string, string>): Promise<WebhookHandlerResult>;
}
