/**
 * Branding controller - thin HTTP handlers in front of branding.service.
 *
 * Mounted at `/api/mail/branding/:serverId` behind localOnly + auth in
 * `mail.routes.ts`. The service does the talking to the Zero webmail
 * server; we just map errors to status codes and pull params.
 */

import type { Context } from "hono";
import { repos } from "@repo/db";
import { env } from "../../config";
import { getRequestContext, type RequestContext } from "../../lib/request-context";
import { permission } from "../../lib/permission";
import { param, isServerInOrg, assertNotCloud } from "../../lib/controller-helpers";
import { safeErrorMessage } from "@repo/core";
import {
  BrandingUnauthorizedError,
  BrandingUnreachableError,
  getBranding,
  updateBranding,
  type Branding,
} from "./branding.service";

/**
 * Org-scoped guard: refuses to operate against a server outside the
 * caller's active organization. Branding writes hit the Zero webmail's
 * admin endpoint with a shared secret stamped at install time — letting
 * an out-of-org caller through would be a brand-takeover of another
 * tenant's webmail.
 */
export async function getBrandingHandler(c: Context) {
  const guard = assertNotCloud(c);
  if (guard) return guard;
  const serverId = param(c, "serverId");
  await permission.assert(getRequestContext(c), { resourceType: "mail_server", resourceId: serverId, action: "read" });
  const ctx = getRequestContext(c);
  if (!(await isServerInOrg(ctx, serverId))) {
    return c.json({ error: "Server not found" }, 404);
  }
  try {
    const branding = await getBranding(serverId);
    return c.json({ branding });
  } catch (err) {
    return errorJson(c, err);
  }
}

export async function updateBrandingHandler(c: Context) {
  const guard = assertNotCloud(c);
  if (guard) return guard;
  const serverId = param(c, "serverId");
  await permission.assert(getRequestContext(c), { resourceType: "mail_server", resourceId: serverId, action: "write" });
  const ctx = getRequestContext(c);
  if (!(await isServerInOrg(ctx, serverId))) {
    return c.json({ error: "Server not found" }, 404);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<Branding>;
  try {
    const branding = await updateBranding(serverId, body);
    return c.json({ branding });
  } catch (err) {
    return errorJson(c, err);
  }
}

function errorJson(c: Context, err: unknown) {
  if (err instanceof BrandingUnauthorizedError) {
    return c.json({ error: err.message }, 502);
  }
  if (err instanceof BrandingUnreachableError) {
    return c.json({ error: err.message }, 502);
  }
  const message = safeErrorMessage(err);
  return c.json({ error: message }, 500);
}
