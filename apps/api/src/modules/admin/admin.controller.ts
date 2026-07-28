import type { Context } from "hono";
import * as service from "./admin.service";

function pageParams(c: Context) {
  return {
    page: Number(c.req.query("page") ?? 1),
    perPage: Number(c.req.query("perPage") ?? 50),
    search: c.req.query("search"),
  };
}

export async function overview(c: Context) {
  return c.json({
    data: await service.getOverview({
      rangeDays: Number(c.req.query("rangeDays") ?? 14),
      granularity: c.req.query("granularity") ?? "day",
      timeZone: c.req.query("timeZone"),
    }),
  });
}

export async function users(c: Context) {
  const verifiedRaw = c.req.query("verified");
  const verified =
    verifiedRaw === "true" ? true : verifiedRaw === "false" ? false : undefined;
  return c.json(
    await service.listUsers({
      ...pageParams(c),
      role: c.req.query("role") || undefined,
      verified,
    }),
  );
}

export async function accessLogs(c: Context) {
  return c.json(
    await service.listAccessLogs({
      ...pageParams(c),
      path: c.req.query("path") || undefined,
    }),
  );
}

export async function activityLogs(c: Context) {
  return c.json(
    await service.listActivityLogs({
      ...pageParams(c),
      eventType: c.req.query("eventType") || undefined,
      actorUserId: c.req.query("actorUserId") || undefined,
    }),
  );
}
