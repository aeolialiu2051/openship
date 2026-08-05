import type { WebhookStrategy } from "../github/github.service";

interface WebhookStatusInput {
  strategy: WebhookStrategy;
  installationInstalled: boolean;
  appWebhookConnected: boolean;
  autoDeploy: boolean;
  sharedWebhookId: number | null;
}

export function appWebhookTargetsInstance(input: {
  active: boolean | null;
  configuredUrl: string | null;
  expectedUrl: string;
  allowConfiguredRemote?: boolean;
}): boolean {
  // GitHub's App webhook config endpoint returns the configured URL but does
  // not consistently expose the hook's `active` flag through GET /app. Treat
  // a missing flag as unknown rather than disabled; an explicit `false` still
  // wins, and the URL must target this exact control-plane instance.
  if (input.active === false || !input.configuredUrl) return false;
  // Local SaaS development uses the real GitHub App and shared cloud data,
  // while its API advertises localhost. Deliveries correctly go to the App's
  // configured public control plane, so the configured URL is authoritative
  // in that narrowly-scoped mode. Production callers never enable this.
  if (input.allowConfiguredRemote) return true;
  try {
    const configured = new URL(input.configuredUrl);
    const expected = new URL(input.expectedUrl);
    configured.hash = "";
    expected.hash = "";
    configured.search = "";
    expected.search = "";
    configured.pathname = configured.pathname.replace(/\/+$/, "") || "/";
    expected.pathname = expected.pathname.replace(/\/+$/, "") || "/";
    return configured.toString() === expected.toString();
  } catch {
    return false;
  }
}

/** Whether the project's selected push-delivery channel is currently usable. */
export function deriveWebhookActive({
  strategy,
  installationInstalled,
  appWebhookConnected,
  autoDeploy,
  sharedWebhookId,
}: WebhookStatusInput): boolean {
  if (strategy === "app") return installationInstalled && appWebhookConnected;
  if (strategy === "domain" || strategy === "repo") {
    return autoDeploy && sharedWebhookId !== null;
  }
  return false;
}
