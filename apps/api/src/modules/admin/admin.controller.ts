import type { Context } from "hono";
import { audit, auditContextFrom } from "../../lib/audit";
import { param } from "../../lib/controller-helpers";
import { getRequestContext } from "../../lib/request-context";
import * as service from "./admin.service";
import * as runtimeConfigService from "../../lib/runtime-config";

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
  const verified = verifiedRaw === "true" ? true : verifiedRaw === "false" ? false : undefined;
  return c.json(
    await service.listUsers({
      ...pageParams(c),
      role: c.req.query("role") || undefined,
      verified,
    }),
  );
}

export async function updateUserPlan(c: Context) {
  const ctx = getRequestContext(c);
  const userId = param(c, "id");
  const body: { planTierId?: "free" | "pro"; periodStart?: string; periodEnd?: string } = await c.req
    .json<{ planTierId?: "free" | "pro"; periodStart?: string; periodEnd?: string }>()
    .catch(() => ({}));
  const result = await service.updateUserPlan(userId, body.planTierId as "free" | "pro", {
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
  });
  await audit.record(auditContextFrom(c, result.organizationId, ctx.userId), {
    eventType: `admin.user.plan_changed_to_${result.planTierId}`,
    resourceType: "user",
    resourceId: userId,
    before: { planTierId: result.previousPlan },
    after: { planTierId: result.planTierId },
  });
  return c.json({ data: result });
}

export async function applications(c: Context) {
  return c.json(
    await service.listApplications({
      ...pageParams(c),
      moderationStatus: c.req.query("moderationStatus") || undefined,
      deploymentStatus: c.req.query("deploymentStatus") || undefined,
    }),
  );
}

export async function suspendApplication(c: Context) {
  const ctx = getRequestContext(c);
  const projectId = param(c, "id");
  const body: { reason?: string } = await c.req.json<{ reason?: string }>().catch(() => ({}));
  const result = await service.suspendApplication(projectId, body.reason);
  await audit.record(auditContextFrom(c, result.project.organizationId, ctx.userId), {
    eventType: "admin.project.suspended",
    resourceType: "project",
    resourceId: projectId,
    before: { moderationStatus: result.beforeStatus },
    after: {
      moderationStatus: "suspended",
      suspendedReason: result.project.suspendedReason,
      warning: result.warning,
      emailWarning: result.emailWarning,
    },
  });
  return c.json({ data: result });
}

export async function resumeApplication(c: Context) {
  const ctx = getRequestContext(c);
  const projectId = param(c, "id");
  const result = await service.resumeApplication(projectId);
  await audit.record(auditContextFrom(c, result.project.organizationId, ctx.userId), {
    eventType: "admin.project.resumed",
    resourceType: "project",
    resourceId: projectId,
    before: { moderationStatus: result.beforeStatus },
    after: { moderationStatus: "active" },
  });
  return c.json({ data: result });
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

export async function runtimeConfig(c: Context) {
  return c.json({ data: await runtimeConfigService.getRuntimeConfigState() });
}

export async function updateRuntimeConfig(c: Context) {
  const ctx = getRequestContext(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const before = await runtimeConfigService.getRuntimeConfigState();
  const data = await runtimeConfigService.updateRuntimeConfig(body);
  await audit.record(auditContextFrom(c, ctx.organizationId, ctx.userId), {
    eventType: "admin.runtime_config.updated",
    resourceType: "instance-settings",
    resourceId: "runtime-config",
    before: before.overrides,
    after: data.overrides,
  });
  return c.json({ data });
}
