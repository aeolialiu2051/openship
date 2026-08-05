import { describe, expect, it } from "vitest";
import {
  appWebhookTargetsInstance,
  deriveWebhookActive,
} from "./project-git-status";

describe("project Git webhook status", () => {
  it("reports an installed GitHub App channel as active independently of deploy target", () => {
    expect(
      deriveWebhookActive({
        strategy: "app",
        installationInstalled: true,
        appWebhookConnected: true,
        autoDeploy: true,
        sharedWebhookId: null,
      }),
    ).toBe(true);
  });

  it("reports an installed App as inactive when its shared webhook is disabled", () => {
    expect(
      deriveWebhookActive({
        strategy: "app",
        installationInstalled: true,
        appWebhookConnected: false,
        autoDeploy: true,
        sharedWebhookId: null,
      }),
    ).toBe(false);
  });

  it("requires the configured App webhook URL to target this instance", () => {
    expect(
      appWebhookTargetsInstance({
        active: true,
        configuredUrl: "https://vibrail.warpgateapi.com/api/proxy/api/webhooks/github/",
        expectedUrl: "https://vibrail.warpgateapi.com/api/proxy/api/webhooks/github",
      }),
    ).toBe(true);
    expect(
      appWebhookTargetsInstance({
        active: true,
        configuredUrl: "https://vibrail.warpgateapi.com/api/proxy/api/webhooks/github",
        expectedUrl: "http://localhost:4100/api/webhooks/github",
      }),
    ).toBe(false);
    expect(
      appWebhookTargetsInstance({
        active: false,
        configuredUrl: "https://vibrail.warpgateapi.com/api/proxy/api/webhooks/github",
        expectedUrl: "https://vibrail.warpgateapi.com/api/proxy/api/webhooks/github",
      }),
    ).toBe(false);
  });

  it("uses a matching App webhook URL when GitHub omits the active flag", () => {
    expect(
      appWebhookTargetsInstance({
        active: null,
        configuredUrl: "https://vibrail.warpgateapi.com/api/proxy/api/webhooks/github",
        expectedUrl: "https://vibrail.warpgateapi.com/api/proxy/api/webhooks/github",
      }),
    ).toBe(true);
    expect(
      appWebhookTargetsInstance({
        active: null,
        configuredUrl: "https://another.example.com/api/webhooks/github",
        expectedUrl: "https://vibrail.warpgateapi.com/api/proxy/api/webhooks/github",
      }),
    ).toBe(false);
  });

  it("accepts the configured public App webhook for local SaaS development", () => {
    expect(
      appWebhookTargetsInstance({
        active: null,
        configuredUrl: "https://vibrail.warpgateapi.com/api/proxy/api/webhooks/github",
        expectedUrl: "http://localhost:4100/api/webhooks/github",
        allowConfiguredRemote: true,
      }),
    ).toBe(true);
    expect(
      appWebhookTargetsInstance({
        active: false,
        configuredUrl: "https://vibrail.warpgateapi.com/api/proxy/api/webhooks/github",
        expectedUrl: "http://localhost:4100/api/webhooks/github",
        allowConfiguredRemote: true,
      }),
    ).toBe(false);
  });

  it("requires both auto-deploy and a registered hook for direct webhook strategies", () => {
    expect(
      deriveWebhookActive({
        strategy: "repo",
        installationInstalled: false,
        appWebhookConnected: false,
        autoDeploy: true,
        sharedWebhookId: 42,
      }),
    ).toBe(true);
    expect(
      deriveWebhookActive({
        strategy: "domain",
        installationInstalled: false,
        appWebhookConnected: false,
        autoDeploy: false,
        sharedWebhookId: 42,
      }),
    ).toBe(false);
  });
});
