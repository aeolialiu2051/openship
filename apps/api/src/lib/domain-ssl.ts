import type { Project } from "@repo/db";
import type { SslProvider, SslResult } from "@repo/adapters";
import { NotFoundError } from "@repo/core";
import { repos } from "@repo/db";
import { env } from "../config/env";
import { platform } from "./controller-helpers";
import { resolveDeploymentPlatform, type DeploymentMeta } from "./deployment-runtime";

/** Map a provider result to the domain row without downgrading an active
 * certificate when the provider had only a transient read failure. */
export function resolveSslPatch(
  currentStatus: string | null | undefined,
  result: SslResult,
): { sslStatus: string; sslIssuer?: string; sslExpiresAt?: Date } | null {
  if (result.verified && result.expiresAt) {
    return {
      sslStatus: "active",
      sslIssuer: result.issuer,
      sslExpiresAt: new Date(result.expiresAt),
    };
  }
  if (result.reason === "read_error" && currentStatus === "active") {
    return null;
  }
  return { sslStatus: "provisioning", sslIssuer: result.issuer };
}

async function resolveSslProvider(project: Project): Promise<SslProvider> {
  if (project.activeDeploymentId) {
    const deployment = await repos.deployment.findById(project.activeDeploymentId);
    if (deployment) {
      const meta = (deployment.meta ?? {}) as DeploymentMeta;
      try {
        const resolved = await resolveDeploymentPlatform(meta, {
          organizationId: deployment.organizationId,
        });
        return resolved.platform.ssl;
      } catch {
        // Fall through to the host/platform anchor below.
      }
    }
  }

  if (!env.CLOUD_MODE && env.DEPLOY_MODE !== "desktop") {
    const local = await repos.server.findLocal(project.organizationId).catch(() => null);
    if (local) {
      try {
        const resolved = await resolveDeploymentPlatform(
          { serverId: local.id } as DeploymentMeta,
          { organizationId: project.organizationId },
        );
        return resolved.platform.ssl;
      } catch {
        // Fall through to the configured platform provider.
      }
    }
  }

  return platform().ssl;
}

/** Provision provider-managed TLS for a verified cloud domain. Self-hosted
 * routes do not call this path; shared Traefik owns their TLS lifecycle. */
export async function manageDomainSsl(
  hostname: string,
  opts: { projectId?: string } = {},
): Promise<SslResult> {
  const domain = await repos.domain.findByHostname(hostname);
  if (!domain || (opts.projectId && domain.projectId !== opts.projectId)) {
    throw new NotFoundError("Domain", hostname);
  }

  const project = await repos.project.findById(domain.projectId);
  if (!project) throw new NotFoundError("Domain", hostname);

  const ssl = await resolveSslProvider(project);
  const result = await ssl.provisionCert(domain.hostname);
  const patch = resolveSslPatch(domain.sslStatus, result);
  if (patch) await repos.domain.updateSsl(domain.id, patch);
  return result;
}
