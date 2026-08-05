import {
  deleteDeploymentDnsRecord,
  isVibrailManagedHostname,
  upsertDeploymentDnsRecord,
} from "./cloudflare-dns";
import {
  ensureRouteDomainRecord,
  isRoutePublishable,
  type PlannedRouteDomain,
} from "./routing-domains";
import type { Domain } from "@repo/db";

interface ServiceRouteDnsDependencies {
  ensureRouteDomainRecord: typeof ensureRouteDomainRecord;
  upsertDeploymentDnsRecord: typeof upsertDeploymentDnsRecord;
  deleteDeploymentDnsRecord: typeof deleteDeploymentDnsRecord;
  isVibrailManagedHostname: typeof isVibrailManagedHostname;
}

const defaultDependencies: ServiceRouteDnsDependencies = {
  ensureRouteDomainRecord,
  upsertDeploymentDnsRecord,
  deleteDeploymentDnsRecord,
  isVibrailManagedHostname,
};

export interface ServiceRouteDnsFailure {
  hostname: string;
  operation: "publish" | "remove";
  message: string;
}

/**
 * Reconcile domain rows and Cloudflare records for a live service edit.
 * Publishable routes returned here are safe to hand to the live proxy; a route
 * whose DNS write failed is deliberately omitted until a later retry/edit.
 */
export async function syncServiceRouteDns(
  opts: {
    projectId: string;
    organizationId: string;
    serverId?: string;
    nextRoutes: PlannedRouteDomain[];
    removedRoutes: PlannedRouteDomain[];
    domainByHostname: Map<string, Domain>;
  },
  dependencies: ServiceRouteDnsDependencies = defaultDependencies,
): Promise<{ publishableRoutes: PlannedRouteDomain[]; failures: ServiceRouteDnsFailure[] }> {
  const publishableRoutes: PlannedRouteDomain[] = [];
  const failures: ServiceRouteDnsFailure[] = [];

  for (const route of opts.nextRoutes) {
    try {
      const domainRecord = await dependencies.ensureRouteDomainRecord({
        projectId: opts.projectId,
        route,
        domainByHostname: opts.domainByHostname,
      });
      const action = domainRecord?.externalIngress
        ? "skipped"
        : await dependencies.upsertDeploymentDnsRecord({
            hostname: route.hostname,
            organizationId: opts.organizationId,
            serverId: opts.serverId,
          });
      if (action === "skipped" && dependencies.isVibrailManagedHostname(route.hostname)) {
        throw new Error(`Managed DNS credentials are unavailable for ${route.hostname}`);
      }

      // A newly-added custom domain starts unverified, but a successful write
      // through the organization's connected Cloudflare zone is itself the
      // ownership proof (upsertDeploymentDnsRecord persists that verification).
      // Try the provider before applying the manual-TXT publish gate so the
      // advertised one-click custom-domain flow can work on the first deploy.
      if (!isRoutePublishable(route) && action === "skipped") continue;
      if (!isRoutePublishable(route) && domainRecord) {
        opts.domainByHostname.set(route.hostname.toLowerCase(), {
          ...domainRecord,
          verified: true,
          status: "active",
        });
      }
      publishableRoutes.push(isRoutePublishable(route) ? route : { ...route, verified: true });
    } catch (error) {
      failures.push({
        hostname: route.hostname,
        operation: "publish",
        message: error instanceof Error ? error.message : "Unknown DNS publishing error",
      });
    }
  }

  for (const route of opts.removedRoutes) {
    try {
      await dependencies.deleteDeploymentDnsRecord({
        hostname: route.hostname,
        organizationId: opts.organizationId,
      });
    } catch (error) {
      failures.push({
        hostname: route.hostname,
        operation: "remove",
        message: error instanceof Error ? error.message : "Unknown DNS removal error",
      });
    }
  }

  return { publishableRoutes, failures };
}
