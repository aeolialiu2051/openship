import type { Context } from "hono";
import { generateId } from "@repo/core";
import { db, schema } from "@repo/db";
import { getRequestContext } from "../../lib/request-context";

export function cleanPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.split(/[?#]/, 1)[0]?.trim();
  if (!path || !path.startsWith("/") || path.length > 512) return null;
  return path;
}

export function cleanReferrer(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    const safe = `${url.origin}${url.pathname}`;
    return safe.length <= 1024 ? safe : safe.slice(0, 1024);
  } catch {
    return null;
  }
}

export async function pageView(c: Context) {
  const ctx = getRequestContext(c);
  const body = (await c.req.json().catch(() => null)) as
    | { path?: unknown; referrer?: unknown }
    | null;
  const path = cleanPath(body?.path);
  if (!path) return c.json({ error: "A valid dashboard pathname is required" }, 400);

  await db.insert(schema.userAccessLog).values({
    id: generateId("access"),
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    sessionId: ctx.sessionId,
    path,
    referrer: cleanReferrer(body?.referrer),
    ipAddress: ctx.clientIp,
    userAgent: ctx.userAgent,
  });

  return c.json({ ok: true }, 201);
}
