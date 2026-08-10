/**
 * Domain controller - Hono request handlers.
 */

import type { Context } from "hono";
import { param } from "../../lib/controller-helpers";
import { getRequestContext } from "../../lib/request-context";
import { permission } from "../../lib/permission";
import { audit, auditContextFrom } from "../../lib/audit";
import { notification } from "../../lib/notification-dispatcher";
import * as domainService from "./domain.service";
import { maybeProxyCloudProject } from "../../lib/cloud/project-router";
import type { TAddDomainBody } from "./domain.schema";
import { getCustomDomainProjectQuota } from "./custom-domain-project-quota";

export const serializeDomain = <T extends { hostname: string }>(domain: T) => ({
  ...domain,
  url: `https://${domain.hostname}`,
});

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function list(c: Context) {
  const ctx = getRequestContext(c);
  const projectId = c.req.query("projectId");
  if (!projectId) {
    return c.json({ error: "projectId query parameter required" }, 400);
  }
  await permission.assert(getRequestContext(c), {
    resourceType: "project",
    resourceId: projectId,
    action: "read",
  });
  const proxied = await maybeProxyCloudProject(c, projectId, getRequestContext(c).organizationId);
  if (proxied) return proxied;
  const domains = await domainService.listDomains(ctx, projectId);
  return c.json({ data: domains.map(serializeDomain) });
}

export async function quota(c: Context) {
  const ctx = getRequestContext(c);
  const quota = await getCustomDomainProjectQuota(ctx.organizationId);
  return c.json({ data: quota });
}

export async function add(c: Context) {
  const ctx = getRequestContext(c);
  const body = await c.req.json<TAddDomainBody>();
  if (body.projectId) {
    await permission.assert(getRequestContext(c), {
      resourceType: "project",
      resourceId: body.projectId,
      action: "write",
    });
    const proxied = await maybeProxyCloudProject(
      c,
      body.projectId,
      getRequestContext(c).organizationId,
      {
        body: JSON.stringify(body),
      },
    );
    if (proxied) return proxied;
  }
  const result = await domainService.addDomain(ctx, body);
  audit.recordAsync(auditContextFrom(c, ctx.organizationId, ctx.userId), {
    eventType: "domain.added",
    resourceType: "domain",
    resourceId: result.domain.id,
    after: {
      projectId: result.domain.projectId,
      hostname: result.domain.hostname,
      isPrimary: result.domain.isPrimary,
    },
  });
  return c.json({ data: serializeDomain(result.domain), records: result.records }, 201);
}

export async function remove(c: Context) {
  const ctx = getRequestContext(c);
  const id = param(c, "id");
  await permission.assert(getRequestContext(c), {
    resourceType: "domain",
    resourceId: id,
    action: "admin",
  });
  await domainService.removeDomain(ctx, id);
  audit.recordAsync(auditContextFrom(c, ctx.organizationId, ctx.userId), {
    eventType: "domain.removed",
    resourceType: "domain",
    resourceId: id,
    after: null,
  });
  return c.json({ message: "domain removed" });
}

export async function verify(c: Context) {
  const ctx = getRequestContext(c);
  const id = param(c, "id");
  await permission.assert(getRequestContext(c), {
    resourceType: "domain",
    resourceId: id,
    action: "write",
  });
  const force = c.req.query("force") === "1" || c.req.query("force") === "true";
  const result = await domainService.verifyDomain(ctx, id, { force });

  // Audit verify attempts (both success and failure) so DNS verification
  // is traceable in the audit log alongside domain.added / domain.removed.
  // Useful for incident response — if a domain is hijacked via brief CNAME
  // control, the audit trail shows exactly when and from where the verify
  // ran.
  audit.recordAsync(auditContextFrom(c, ctx.organizationId, ctx.userId), {
    eventType: result.verified ? "domain.verified" : "domain.verify_failed",
    resourceType: "domain",
    resourceId: id,
    after: {
      verified: result.verified,
      cnameVerified: result.cnameVerified,
      txtVerified: result.txtVerified,
    },
  });

  // Notify on failure. This is the non-streaming path used by the daily
  // re-verify cron + programmatic callers — the async case where a failure is
  // worth surfacing to the team. (The interactive `verifyStream` modal doesn't
  // notify: the person clicking is already watching the live result.)
  if (!result.verified) {
    notification.emit({
      organizationId: ctx.organizationId,
      eventType: "domain.verification_failed",
      resourceType: "domain",
      resourceId: id,
      payload: {
        message: result.message ?? "Domain verification failed",
        cnameVerified: result.cnameVerified,
        txtVerified: result.txtVerified,
      },
    });
  }

  // Failed verification returns 422 so the dashboard's React Query / fetch
  // wrapper can use the standard error path while still reading
  // message/cnameVerified/txtVerified from the body. 200 on success.
  return c.json(result, result.verified ? 200 : 422);
}

export async function records(c: Context) {
  const ctx = getRequestContext(c);
  const id = param(c, "id");
  await permission.assert(getRequestContext(c), {
    resourceType: "domain",
    resourceId: id,
    action: "read",
  });
  const result = await domainService.getDomainRecords(ctx, id);
  return c.json({ data: result });
}

/** POST /domains/:id/primary - make this domain the project's primary */
export async function setPrimary(c: Context) {
  const ctx = getRequestContext(c);
  const id = param(c, "id");
  await permission.assert(getRequestContext(c), {
    resourceType: "domain",
    resourceId: id,
    action: "write",
  });
  const domain = await domainService.setPrimaryDomain(ctx, id);
  audit.recordAsync(auditContextFrom(c, ctx.organizationId, ctx.userId), {
    eventType: "domain.set_primary",
    resourceType: "domain",
    resourceId: id,
    after: { projectId: domain.projectId, hostname: domain.hostname, isPrimary: true },
  });
  return c.json({ data: serializeDomain(domain) });
}

/** POST /domains/preview - get DNS records for a hostname (no DB write) */
export async function preview(c: Context) {
  const body = await c.req.json<{ hostname: string }>();
  if (!body.hostname?.trim()) {
    return c.json({ error: "hostname is required" }, 400);
  }
  const result = await domainService.previewRecords(body.hostname.trim().toLowerCase());
  return c.json({ data: result });
}

/**
 * POST /domains/verify-pending - admin/cron endpoint.
 *
 * Re-runs DNS verification for every custom domain still in `pending`
 * state and added more than `minAgeMinutes` ago. Wire this up to a
 * scheduled job (Kubernetes CronJob / systemd timer / external scheduler)
 * so domains whose DNS finishes propagating after the user closed the
 * tab eventually flip to verified without manual re-clicks.
 *
 * Body: { minAgeMinutes?: number; limit?: number }
 */
export async function verifyPending(c: Context) {
  // SCOPED to the caller's org: pass ctx.organizationId so the sweep only sees
  // and re-verifies THIS org's pending domains. Without it the handler returned
  // every tenant's pending hostnames and triggered their DNS/SSL — a member of
  // one org has domain:write only in their OWN org, which must bound the WORK,
  // not just admit the request. The instance-wide sweep is the trusted system
  // `domains:verify-pending` cron (job.registry.ts), which calls the service
  // with no organizationId.
  const ctx = getRequestContext(c);
  type Body = { minAgeMinutes?: number; limit?: number };
  const body: Body = await c.req.json<Body>().catch(() => ({}) as Body);
  const result = await domainService.verifyPendingDomains({
    minAgeMinutes: typeof body.minAgeMinutes === "number" ? body.minAgeMinutes : undefined,
    limit: typeof body.limit === "number" ? body.limit : undefined,
    organizationId: ctx.organizationId,
  });
  return c.json({ data: result });
}
