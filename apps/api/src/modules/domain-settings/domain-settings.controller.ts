import type { Context } from "hono";
import { safeErrorMessage } from "@repo/core";
import { audit, auditContextFrom } from "../../lib/audit";
import { getRequestContext } from "../../lib/request-context";
import * as service from "./domain-settings.service";

export async function list(c: Context) {
  const ctx = getRequestContext(c);
  return c.json({ data: await service.listDomainSettings(ctx) });
}

async function readInput(c: Context) {
  return c.req.json<service.DomainSettingsInput>().catch(() => null);
}

export async function create(c: Context) {
  const ctx = getRequestContext(c);
  const body = await readInput(c);
  if (!body) return c.json({ error: "Invalid request body" }, 400);
  try {
    const data = await service.createDomainSettings(ctx, body);
    audit.recordAsync(auditContextFrom(c, ctx.organizationId, ctx.userId), {
      eventType: "domain_settings.created",
      resourceType: "settings",
      resourceId: data?.id ?? ctx.organizationId,
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

export async function test(c: Context) {
  const ctx = getRequestContext(c);
  const body = await c.req.json<service.DomainSettingsInput & { id?: string }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request body" }, 400);
  const { id, ...input } = body;
  try {
    return c.json({ data: await service.testDomainSettings(ctx, input, id) });
  } catch (error) {
    return c.json({ error: safeErrorMessage(error) }, 400);
  }
}

export async function update(c: Context) {
  const ctx = getRequestContext(c);
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Domain settings ID is required" }, 400);
  const body = await readInput(c);
  if (!body) return c.json({ error: "Invalid request body" }, 400);
  try {
    const data = await service.updateDomainSettings(ctx, id, body);
    audit.recordAsync(auditContextFrom(c, ctx.organizationId, ctx.userId), {
      eventType: "domain_settings.updated",
      resourceType: "settings",
      resourceId: id,
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
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Domain settings ID is required" }, 400);
  try {
    return c.json({ data: await service.verifyDomainSettings(ctx, id) });
  } catch (error) {
    return c.json({ error: safeErrorMessage(error) }, 400);
  }
}

export async function remove(c: Context) {
  const ctx = getRequestContext(c);
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Domain settings ID is required" }, 400);
  await service.removeDomainSettings(ctx, id);
  audit.recordAsync(auditContextFrom(c, ctx.organizationId, ctx.userId), {
    eventType: "domain_settings.removed",
    resourceType: "settings",
    resourceId: id,
    after: null,
  });
  return c.json({ data: { ok: true } });
}
