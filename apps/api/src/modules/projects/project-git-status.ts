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
}): boolean {
  if (input.active !== true || !input.configuredUrl) return false;
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
