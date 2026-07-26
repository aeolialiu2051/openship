import { cache } from "react";
import { serverApi, ServerApiError } from "@/lib/server/api";
import { getDeploymentInfo } from "@/lib/server/session";
import type { BillingState } from "@/lib/api/billing";
import type { BillingUnavailableReason } from "../_components/BillingUnavailable";

interface BillingStateResponse {
  data: BillingState;
}

interface CloudStatus {
  connected: boolean;
}

export type BillingFetchResult =
  | { kind: "ok"; state: BillingState }
  | { kind: "unavailable"; reason: BillingUnavailableReason };

async function fetchCloudConnected(): Promise<boolean> {
  try {
    const res = await serverApi.get<CloudStatus>("cloud/status", {
      cache: "no-store",
    });
    return res?.connected ?? false;
  } catch {
    return false;
  }
}

/**
 * One request-scoped billing snapshot shared by the billing layout and page.
 * React cache() de-duplicates both callers during the same App Router render,
 * while `no-store` keeps the result fresh across separate navigations.
 */
export const getBillingStateResult = cache(async (): Promise<BillingFetchResult> => {
  const info = await getDeploymentInfo();
  const isLocalMode = info.selfHosted;

  try {
    const res = await serverApi.get<BillingStateResponse>("billing/state", {
      cache: "no-store",
    });
    if (res?.data) return { kind: "ok", state: res.data };
    return {
      kind: "unavailable",
      reason: isLocalMode ? "cloud-unreachable" : "saas-not-enabled",
    };
  } catch (err) {
    if (err instanceof ServerApiError) {
      if (err.status === 401) {
        const body = err.body as { code?: string } | null | undefined;
        if (body?.code === "cloud_session_expired") {
          return { kind: "unavailable", reason: "cloud-session-expired" };
        }
      }

      if (err.status === 403) {
        const body = err.body as { code?: string } | null | undefined;
        if (body?.code === "cloud_not_connected") {
          return { kind: "unavailable", reason: "cloud-not-connected" };
        }
      }

      if (err.status === 404 || err.status === 501) {
        if (!isLocalMode) {
          return { kind: "unavailable", reason: "saas-not-enabled" };
        }
        const connected = await fetchCloudConnected();
        return {
          kind: "unavailable",
          reason: connected ? "cloud-unreachable" : "cloud-not-connected",
        };
      }

      if (err.status >= 500) {
        if (isLocalMode) {
          const connected = await fetchCloudConnected();
          return {
            kind: "unavailable",
            reason: connected ? "cloud-unreachable" : "cloud-not-connected",
          };
        }
        return { kind: "unavailable", reason: "saas-not-enabled" };
      }
    }

    if (isLocalMode) {
      const connected = await fetchCloudConnected();
      return {
        kind: "unavailable",
        reason: connected ? "cloud-unreachable" : "cloud-not-connected",
      };
    }
    return { kind: "unavailable", reason: "saas-not-enabled" };
  }
});
