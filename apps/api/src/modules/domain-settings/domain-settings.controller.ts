import type { Context } from "hono";
import { safeErrorMessage } from "@repo/core";
import { audit, auditContextFrom } from "../../lib/audit";
import { getRequestContext } from "../../lib/request-context";
import * as service from "./domain-settings.service";

export async function get(c: Context) {
  const ctx = getRequestContext(c);
  return c.json({ data: await service.getDomainSettings(ctx) });
}

export async function save(c: Context) {
  const ctx = getRequestContext(c);
  const body = await c.req.json<service.DomainSettingsInput>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request body" }, 400);
  try {
    const data = await service.saveDomainSettings(ctx, body);
    audit.recordAsync(auditContextFrom(c, ctx.organizationId, ctx.userId), {
      eventType: "domain_settings.updated",
      resourceType: "settings",
      resourceId: ctx.organizationId,
      after: {
        domain: data?.domain,
        cloudflareZoneId: data?.cloudflareZoneId,
        cloudflareProxy: data?.cloudflareProxy,
      },
    });
    return c.json({ data });
  } catch (error) {
    return c.json({ error: safeErrorMessage(error) }, 400);
  }
}

export async function verify(c: Context) {
  const ctx = getRequestContext(c);
  try {
    return c.json({ data: await service.verifyDomainSettings(ctx) });
  } catch (error) {
    return c.json({ error: safeErrorMessage(error) }, 400);
  }
}

export async function remove(c: Context) {
  const ctx = getRequestContext(c);
  await service.removeDomainSettings(ctx);
  audit.recordAsync(auditContextFrom(c, ctx.organizationId, ctx.userId), {
    eventType: "domain_settings.removed",
    resourceType: "settings",
    resourceId: ctx.organizationId,
    after: null,
  });
  return c.json({ data: { ok: true } });
}
