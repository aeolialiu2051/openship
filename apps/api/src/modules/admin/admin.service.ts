import { and, asc, count, desc, eq, gte, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  originHostnameForServer,
  resolveDashboardPageUrl,
  safeErrorMessage,
} from "@repo/core";
import { db, repos, schema } from "@repo/db";
import { DockerRuntime } from "@repo/adapters";
import { resolveDeploymentRuntime } from "../../lib/deployment-runtime";
import { projectSuspendedEmail } from "../../lib/email-templates";
import { sendMail } from "../../lib/mail";
import { resolveDashboardPublicUrl } from "../../lib/public-url";
import { getSupportEmail } from "../../lib/support-email";
import { resolveTraefikManualConfig } from "../../lib/traefik-routing";
import { setQuotaForTier } from "../billing/billing-oblien-quota";

const MAX_PAGE_SIZE = 200;
const TREND_RANGE_DAYS = [7, 14, 30] as const;
const TREND_GRANULARITIES = ["hour", "day", "week"] as const;

export type AdminTrendRangeDays = (typeof TREND_RANGE_DAYS)[number];
export type AdminTrendGranularity = (typeof TREND_GRANULARITIES)[number];

export interface AdminOverviewOptions {
  rangeDays?: number;
  granularity?: string;
  timeZone?: string;
}

export interface AdminListOptions {
  page: number;
  perPage: number;
  search?: string;
}

function safePage(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

function safePerPage(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(value))) : 50;
}

function normalizeListOptions(opts: AdminListOptions) {
  const page = safePage(opts.page);
  const perPage = safePerPage(opts.perPage);
  return {
    page,
    perPage,
    offset: (page - 1) * perPage,
    search: opts.search?.trim() || undefined,
  };
}

function defaultTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function validTimeZone(value: string | undefined): string {
  if (!value || value.length > 100) return defaultTimeZone();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    return defaultTimeZone();
  }
}

function calendarParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day" | "hour") =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
  };
}

function normalizeOverviewOptions(opts: AdminOverviewOptions = {}): {
  rangeDays: AdminTrendRangeDays;
  granularity: AdminTrendGranularity;
} {
  const rangeDays = TREND_RANGE_DAYS.includes(opts.rangeDays as AdminTrendRangeDays)
    ? (opts.rangeDays as AdminTrendRangeDays)
    : 14;
  const granularity = TREND_GRANULARITIES.includes(opts.granularity as AdminTrendGranularity)
    ? (opts.granularity as AdminTrendGranularity)
    : "day";
  return { rangeDays, granularity };
}

function trendBucketKeys(
  now: Date,
  timeZone: string,
  rangeDays: AdminTrendRangeDays,
  granularity: AdminTrendGranularity,
): string[] {
  const current = calendarParts(now, timeZone);
  const firstCalendarDay = new Date(
    Date.UTC(current.year, current.month - 1, current.day - (rangeDays - 1)),
  );

  if (granularity === "hour") {
    const endHour = new Date(Date.UTC(current.year, current.month - 1, current.day, current.hour));
    const result: string[] = [];
    for (
      let cursor = firstCalendarDay.getTime();
      cursor <= endHour.getTime();
      cursor += 60 * 60 * 1000
    ) {
      result.push(new Date(cursor).toISOString().slice(0, 13) + ":00");
    }
    return result;
  }

  if (granularity === "week") {
    const firstDayOfWeek = new Date(firstCalendarDay);
    const mondayOffset = (firstDayOfWeek.getUTCDay() + 6) % 7;
    firstDayOfWeek.setUTCDate(firstDayOfWeek.getUTCDate() - mondayOffset);

    const currentCalendarDay = new Date(Date.UTC(current.year, current.month - 1, current.day));
    const currentMondayOffset = (currentCalendarDay.getUTCDay() + 6) % 7;
    currentCalendarDay.setUTCDate(currentCalendarDay.getUTCDate() - currentMondayOffset);

    const result: string[] = [];
    for (
      let cursor = firstDayOfWeek.getTime();
      cursor <= currentCalendarDay.getTime();
      cursor += 7 * 24 * 60 * 60 * 1000
    ) {
      result.push(new Date(cursor).toISOString().slice(0, 10));
    }
    return result;
  }

  return Array.from({ length: rangeDays }, (_, index) => {
    const day = new Date(firstCalendarDay);
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

export async function getOverview(opts: AdminOverviewOptions = {}) {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const { rangeDays, granularity } = normalizeOverviewOptions(opts);
  const timeZone = validTimeZone(opts.timeZone);
  const bucketKeys = trendBucketKeys(now, timeZone, rangeDays, granularity);
  const currentCalendar = calendarParts(now, timeZone);
  const rangeStartDay = new Date(
    Date.UTC(
      currentCalendar.year,
      currentCalendar.month - 1,
      currentCalendar.day - (rangeDays - 1),
    ),
  )
    .toISOString()
    .slice(0, 10);
  const timeZoneLiteral = sql.raw(`'${timeZone.replaceAll("'", "''")}'`);
  const granularityLiteral = sql.raw(`'${granularity}'`);
  const userLocalCreatedAt = sql`${schema.user.createdAt} at time zone 'UTC' at time zone ${timeZoneLiteral}`;
  const accessLogLocalCreatedAt = sql`${schema.userAccessLog.createdAt} at time zone 'UTC' at time zone ${timeZoneLiteral}`;
  const deploymentLocalCreatedAt = sql`${schema.deployment.createdAt} at time zone 'UTC' at time zone ${timeZoneLiteral}`;
  const auditLocalCreatedAt = sql`${schema.auditEvent.createdAt} at time zone 'UTC' at time zone ${timeZoneLiteral}`;
  const userTrendBucket = sql`date_trunc(
    ${granularityLiteral},
    ${userLocalCreatedAt}
  )`;
  const deploymentTrendBucket = sql`date_trunc(
    ${granularityLiteral},
    ${deploymentLocalCreatedAt}
  )`;
  const bucketFormat = granularity === "hour" ? 'YYYY-MM-DD"T"HH24:00' : "YYYY-MM-DD";
  const bucketFormatLiteral = sql.raw(`'${bucketFormat}'`);

  const [
    [users],
    [active],
    [activeSessions],
    [organizations],
    [projects],
    [deployments],
    [activity],
    registrationRows,
    deploymentTrendRows,
  ] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        admins: sql<number>`count(*) filter (where ${schema.user.role} = 'admin')::int`,
        verified: sql<number>`count(*) filter (where ${schema.user.emailVerified} = true)::int`,
        new24h: sql<number>`count(*) filter (where ${schema.user.createdAt} >= ${oneDayAgo})::int`,
        new7d: sql<number>`count(*) filter (where ${schema.user.createdAt} >= ${sevenDaysAgo})::int`,
        new30d: sql<number>`count(*) filter (where ${schema.user.createdAt} >= ${thirtyDaysAgo})::int`,
        selectedRange: sql<number>`count(*) filter (
          where ${userLocalCreatedAt} >= ${rangeStartDay}::timestamp
        )::int`,
      })
      .from(schema.user),
    db
      .select({
        day: sql<number>`count(distinct ${schema.userAccessLog.userId}) filter (where ${schema.userAccessLog.createdAt} >= ${oneDayAgo})::int`,
        week: sql<number>`count(distinct ${schema.userAccessLog.userId}) filter (where ${schema.userAccessLog.createdAt} >= ${sevenDaysAgo})::int`,
        month: sql<number>`count(distinct ${schema.userAccessLog.userId}) filter (where ${schema.userAccessLog.createdAt} >= ${thirtyDaysAgo})::int`,
        selectedRange: sql<number>`count(distinct ${schema.userAccessLog.userId}) filter (
          where ${accessLogLocalCreatedAt} >= ${rangeStartDay}::timestamp
        )::int`,
      })
      .from(schema.userAccessLog),
    db
      .select({
        total: sql<number>`count(*) filter (where ${schema.session.expiresAt} > ${now})::int`,
      })
      .from(schema.session),
    db
      .select({
        total: sql<number>`count(*)::int`,
        teams: sql<number>`count(*) filter (where ${schema.organization.isTeam} = true)::int`,
      })
      .from(schema.organization),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.project)
      .where(isNull(schema.project.deletedAt)),
    db
      .select({
        total: sql<number>`count(*)::int`,
        last7d: sql<number>`count(*) filter (where ${schema.deployment.createdAt} >= ${sevenDaysAgo})::int`,
        ready: sql<number>`count(*) filter (where ${schema.deployment.status} in ('ready', 'partial_failure'))::int`,
        failed: sql<number>`count(*) filter (where ${schema.deployment.status} = 'failed')::int`,
        selectedRange: sql<number>`count(*) filter (
          where ${deploymentLocalCreatedAt} >= ${rangeStartDay}::timestamp
        )::int`,
        selectedRangeReady: sql<number>`count(*) filter (
          where ${deploymentLocalCreatedAt} >= ${rangeStartDay}::timestamp
            and ${schema.deployment.status} in ('ready', 'partial_failure')
        )::int`,
        selectedRangeFailed: sql<number>`count(*) filter (
          where ${deploymentLocalCreatedAt} >= ${rangeStartDay}::timestamp
            and ${schema.deployment.status} = 'failed'
        )::int`,
      })
      .from(schema.deployment),
    db
      .select({
        last24h: sql<number>`count(*) filter (
          where ${schema.auditEvent.createdAt} >= ${oneDayAgo}
        )::int`,
        selectedRange: sql<number>`count(*) filter (
          where ${auditLocalCreatedAt} >= ${rangeStartDay}::timestamp
        )::int`,
      })
      .from(schema.auditEvent),
    db
      .select({
        bucket: sql<string>`to_char(${userTrendBucket}, ${bucketFormatLiteral})`,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.user)
      .where(sql`${userLocalCreatedAt} >= ${rangeStartDay}::timestamp`)
      .groupBy(userTrendBucket)
      .orderBy(asc(userTrendBucket)),
    db
      .select({
        bucket: sql<string>`to_char(${deploymentTrendBucket}, ${bucketFormatLiteral})`,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.deployment)
      .where(sql`${deploymentLocalCreatedAt} >= ${rangeStartDay}::timestamp`)
      .groupBy(deploymentTrendBucket)
      .orderBy(asc(deploymentTrendBucket)),
  ]);

  const registrationsByBucket = new Map(
    registrationRows.map((row) => [row.bucket, Number(row.count)]),
  );
  const deploymentsByBucket = new Map(
    deploymentTrendRows.map((row) => [row.bucket, Number(row.count)]),
  );
  const trendPoints = bucketKeys.map((bucket) => ({
    bucket,
    registrations: registrationsByBucket.get(bucket) ?? 0,
    deployments: deploymentsByBucket.get(bucket) ?? 0,
  }));

  return {
    users: {
      total: Number(users?.total ?? 0),
      admins: Number(users?.admins ?? 0),
      verified: Number(users?.verified ?? 0),
      new24h: Number(users?.new24h ?? 0),
      new7d: Number(users?.new7d ?? 0),
      new30d: Number(users?.new30d ?? 0),
    },
    activeUsers: {
      day: Number(active?.day ?? 0),
      week: Number(active?.week ?? 0),
      month: Number(active?.month ?? 0),
      sessions: Number(activeSessions?.total ?? 0),
    },
    organizations: {
      total: Number(organizations?.total ?? 0),
      teams: Number(organizations?.teams ?? 0),
    },
    projects: Number(projects?.total ?? 0),
    deployments: {
      total: Number(deployments?.total ?? 0),
      last7d: Number(deployments?.last7d ?? 0),
      ready: Number(deployments?.ready ?? 0),
      failed: Number(deployments?.failed ?? 0),
    },
    activityLast24h: Number(activity?.last24h ?? 0),
    periodMetrics: {
      rangeDays,
      newUsers: Number(users?.selectedRange ?? 0),
      activeUsers: Number(active?.selectedRange ?? 0),
      deployments: Number(deployments?.selectedRange ?? 0),
      readyDeployments: Number(deployments?.selectedRangeReady ?? 0),
      failedDeployments: Number(deployments?.selectedRangeFailed ?? 0),
      activity: Number(activity?.selectedRange ?? 0),
    },
    usageTrend: {
      timeZone,
      rangeDays,
      granularity,
      points: trendPoints,
    },
  };
}

export async function listUsers(opts: AdminListOptions & { role?: string; verified?: boolean }) {
  const { page, perPage, offset, search } = normalizeListOptions(opts);
  const filters: SQL[] = [];
  if (search) {
    const pattern = `%${search}%`;
    const searchFilter = or(
      ilike(schema.user.name, pattern),
      ilike(schema.user.email, pattern),
      ilike(schema.user.id, pattern),
    );
    if (searchFilter) filters.push(searchFilter);
  }
  if (opts.role) filters.push(eq(schema.user.role, opts.role));
  if (opts.verified !== undefined) filters.push(eq(schema.user.emailVerified, opts.verified));
  const where = filters.length ? and(...filters) : undefined;
  const now = new Date();
  // These correlated subqueries contain their own tables with `id` columns.
  // Interpolating schema.user.id inside raw SQL renders only `"id"`, which is
  // ambiguous once a subquery joins multiple relations. Qualify the outer
  // reference explicitly against the main `user` table.
  const outerUserId = sql.raw('"user"."id"');

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        image: schema.user.image,
        role: schema.user.role,
        emailVerified: schema.user.emailVerified,
        autoProvisioned: schema.user.autoProvisioned,
        createdAt: schema.user.createdAt,
        updatedAt: schema.user.updatedAt,
        planTierId: sql<string>`coalesce(
          (select o.plan_tier_id from ${schema.organization} o
           where o.id = ('org_' || ${outerUserId}) limit 1),
          (select o.plan_tier_id
           from ${schema.organization} o
           join ${schema.member} m on m.organization_id = o.id
           where m.user_id = ${outerUserId} and m.role = 'owner' and o.is_team = false
           order by o.created_at asc limit 1),
          'free'
        )`,
        subscriptionInterval: sql<string | null>`coalesce(
          (select o.subscription_interval from ${schema.organization} o
           where o.id = ('org_' || ${outerUserId}) limit 1),
          (select o.subscription_interval from ${schema.organization} o
           join ${schema.member} m on m.organization_id = o.id
           where m.user_id = ${outerUserId} and m.role = 'owner' and o.is_team = false
           order by o.created_at asc limit 1)
        )`,
        currentPeriodStart: sql<Date | null>`coalesce(
          (select o.current_period_start from ${schema.organization} o
           where o.id = ('org_' || ${outerUserId}) limit 1),
          (select o.current_period_start from ${schema.organization} o
           join ${schema.member} m on m.organization_id = o.id
           where m.user_id = ${outerUserId} and m.role = 'owner' and o.is_team = false
           order by o.created_at asc limit 1)
        )`.mapWith(schema.organization.currentPeriodStart),
        currentPeriodEnd: sql<Date | null>`coalesce(
          (select o.current_period_end from ${schema.organization} o
           where o.id = ('org_' || ${outerUserId}) limit 1),
          (select o.current_period_end from ${schema.organization} o
           join ${schema.member} m on m.organization_id = o.id
           where m.user_id = ${outerUserId} and m.role = 'owner' and o.is_team = false
           order by o.created_at asc limit 1)
        )`.mapWith(schema.organization.currentPeriodEnd),
        organizationCount: sql<number>`(
          select count(*)::int from ${schema.member} m where m.user_id = ${outerUserId}
        )`,
        projectCount: sql<number>`(
          select count(*)::int
          from ${schema.project} p
          join ${schema.member} m on m.organization_id = p.organization_id
          where m.user_id = ${outerUserId} and p.deleted_at is null
        )`,
        deploymentCount: sql<number>`(
          select count(*)::int
          from ${schema.deployment} d
          join ${schema.member} m on m.organization_id = d.organization_id
          where m.user_id = ${outerUserId}
        )`,
        activeSessionCount: sql<number>`(
          select count(*)::int from ${schema.session} s
          where s.user_id = ${outerUserId} and s.expires_at > ${now}
        )`,
        lastSeenAt: sql<Date | null>`(
          select coalesce(
            (select max(l.created_at) from ${schema.userAccessLog} l where l.user_id = ${outerUserId}),
            (select max(s.updated_at) from ${schema.session} s where s.user_id = ${outerUserId})
          )
        )`.mapWith(schema.userAccessLog.createdAt),
        lastActionAt: sql<Date | null>`(
          select max(a.created_at) from ${schema.auditEvent} a where a.actor_user_id = ${outerUserId}
        )`.mapWith(schema.auditEvent.createdAt),
      })
      .from(schema.user)
      .where(where)
      .orderBy(desc(schema.user.createdAt))
      .limit(perPage)
      .offset(offset),
    db.select({ value: count() }).from(schema.user).where(where),
  ]);

  return {
    data: rows.map((row) => ({
      ...row,
      organizationCount: Number(row.organizationCount ?? 0),
      projectCount: Number(row.projectCount ?? 0),
      deploymentCount: Number(row.deploymentCount ?? 0),
      activeSessionCount: Number(row.activeSessionCount ?? 0),
    })),
    total: Number(total?.value ?? 0),
    page,
    perPage,
  };
}

export async function updateUserPlan(
  userId: string,
  planTierId: "free" | "pro",
  period?: { periodStart?: string; periodEnd?: string; interval?: "monthly" | "annual" },
) {
  if (planTierId !== "free" && planTierId !== "pro") {
    throw new ValidationError("Plan must be free or pro");
  }
  const [target] = await db
    .select({
      organizationId: schema.organization.id,
      previousPlan: schema.organization.planTierId,
      previousInterval: schema.organization.subscriptionInterval,
    })
    .from(schema.organization)
    .innerJoin(schema.member, eq(schema.member.organizationId, schema.organization.id))
    .where(
      and(
        eq(schema.member.userId, userId),
        eq(schema.member.role, "owner"),
        eq(schema.organization.isTeam, false),
      ),
    )
    .orderBy(
      sql`case when ${schema.organization.id} = ${`org_${userId}`} then 0 else 1 end`,
      asc(schema.organization.createdAt),
    )
    .limit(1);

  if (!target) throw new NotFoundError("Personal workspace for user", userId);

  const periodStart = planTierId === "pro" ? parsePeriodDate(period?.periodStart) : null;
  const periodEnd = planTierId === "pro" ? parsePeriodDate(period?.periodEnd, true) : null;
  if (planTierId === "pro" && (!periodStart || !periodEnd || periodEnd < periodStart)) {
    throw new ValidationError("A valid PRO period start and end date are required");
  }
  if (planTierId === "pro" && period?.interval !== "monthly" && period?.interval !== "annual") {
    throw new ValidationError("A PRO subscription interval is required");
  }

  await setQuotaForTier(target.organizationId, planTierId);
  await db
    .update(schema.organization)
    .set({
      planTierId,
      subscriptionStatus: "active",
      subscriptionInterval: planTierId === "pro" ? period?.interval : null,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    })
    .where(eq(schema.organization.id, target.organizationId));

  return {
    ...target,
    planTierId,
    subscriptionInterval: planTierId === "pro" ? period?.interval : null,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
  };
}

function parsePeriodDate(value: string | undefined, endOfDay = false): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(date.getTime())) return null;
  const normalized = date.toISOString().slice(0, 10);
  return normalized === value ? date : null;
}

export async function listApplications(
  opts: AdminListOptions & { moderationStatus?: string; deploymentStatus?: string },
) {
  const { page, perPage, offset, search } = normalizeListOptions(opts);
  const outerProjectId = sql.raw('"project"."id"');
  const outerProjectOrganizationId = sql.raw('"project"."organization_id"');
  const filters: SQL[] = [
    isNull(schema.project.deletedAt),
    sql`exists (
      select 1 from ${schema.deployment} listed_deployment
      where listed_deployment.project_id = ${outerProjectId}
    )`,
  ];

  if (search) {
    const pattern = `%${search}%`;
    const searchFilter = or(
      ilike(schema.project.name, pattern),
      ilike(schema.project.id, pattern),
      ilike(schema.project.slug, pattern),
      ilike(schema.projectGroup.name, pattern),
      ilike(schema.organization.name, pattern),
      sql`exists (
        select 1 from ${schema.domain} search_domain
        where search_domain.project_id = ${outerProjectId}
          and search_domain.hostname ilike ${pattern}
      )`,
      sql`exists (
        select 1
        from ${schema.member} search_member
        join ${schema.user} search_user on search_user.id = search_member.user_id
        where search_member.organization_id = ${outerProjectOrganizationId}
          and search_member.role = 'owner'
          and (search_user.email ilike ${pattern} or search_user.name ilike ${pattern})
      )`,
    );
    if (searchFilter) filters.push(searchFilter);
  }

  if (opts.moderationStatus === "active" || opts.moderationStatus === "suspended") {
    filters.push(eq(schema.project.moderationStatus, opts.moderationStatus));
  }
  if (opts.deploymentStatus) {
    filters.push(sql`(
      select latest_deployment.status
      from ${schema.deployment} latest_deployment
      where latest_deployment.project_id = ${outerProjectId}
      order by latest_deployment.created_at desc
      limit 1
    ) = ${opts.deploymentStatus}`);
  }

  const where = and(...filters);
  const latestDeploymentStatus = sql<string | null>`(
    select latest_deployment.status
    from ${schema.deployment} latest_deployment
    where latest_deployment.project_id = ${outerProjectId}
    order by latest_deployment.created_at desc
    limit 1
  )`;

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: schema.project.id,
        name: schema.project.name,
        appName: schema.projectGroup.name,
        environmentName: schema.project.environmentName,
        environmentType: schema.project.environmentType,
        slug: schema.project.slug,
        framework: schema.project.framework,
        isApp: schema.project.isApp,
        appTemplateId: schema.project.appTemplateId,
        gitProvider: schema.project.gitProvider,
        gitOwner: schema.project.gitOwner,
        gitRepo: schema.project.gitRepo,
        cloudWorkspaceId: schema.project.cloudWorkspaceId,
        moderationStatus: schema.project.moderationStatus,
        suspendedAt: schema.project.suspendedAt,
        suspendedReason: schema.project.suspendedReason,
        activeDeploymentId: schema.project.activeDeploymentId,
        organizationId: schema.project.organizationId,
        organizationName: schema.organization.name,
        ownerName: sql<string | null>`(
          select owner_user.name
          from ${schema.member} owner_member
          join ${schema.user} owner_user on owner_user.id = owner_member.user_id
          where owner_member.organization_id = ${outerProjectOrganizationId}
            and owner_member.role = 'owner'
          order by owner_member.created_at asc
          limit 1
        )`,
        ownerEmail: sql<string | null>`(
          select owner_user.email
          from ${schema.member} owner_member
          join ${schema.user} owner_user on owner_user.id = owner_member.user_id
          where owner_member.organization_id = ${outerProjectOrganizationId}
            and owner_member.role = 'owner'
          order by owner_member.created_at asc
          limit 1
        )`,
        primaryDomain: sql<string | null>`(
          select project_domain.hostname
          from ${schema.domain} project_domain
          where project_domain.project_id = ${outerProjectId}
          order by project_domain.is_primary desc, project_domain.created_at asc
          limit 1
        )`,
        latestDeploymentId: sql<string | null>`(
          select latest_deployment.id
          from ${schema.deployment} latest_deployment
          where latest_deployment.project_id = ${outerProjectId}
          order by latest_deployment.created_at desc
          limit 1
        )`,
        latestDeploymentStatus,
        latestDeploymentUrl: sql<string | null>`(
          select latest_deployment.url
          from ${schema.deployment} latest_deployment
          where latest_deployment.project_id = ${outerProjectId}
          order by latest_deployment.created_at desc
          limit 1
        )`,
        latestDeploymentCreatedAt: sql<Date | null>`(
          select latest_deployment.created_at
          from ${schema.deployment} latest_deployment
          where latest_deployment.project_id = ${outerProjectId}
          order by latest_deployment.created_at desc
          limit 1
        )`.mapWith(schema.deployment.createdAt),
        createdAt: schema.project.createdAt,
        updatedAt: schema.project.updatedAt,
      })
      .from(schema.project)
      .innerJoin(schema.projectGroup, eq(schema.project.groupId, schema.projectGroup.id))
      .innerJoin(schema.organization, eq(schema.project.organizationId, schema.organization.id))
      .where(where)
      .orderBy(
        desc(sql`case when ${schema.project.moderationStatus} = 'suspended' then 1 else 0 end`),
        desc(schema.project.updatedAt),
        desc(schema.project.id),
      )
      .limit(perPage)
      .offset(offset),
    db
      .select({ value: count() })
      .from(schema.project)
      .innerJoin(schema.projectGroup, eq(schema.project.groupId, schema.projectGroup.id))
      .innerJoin(schema.organization, eq(schema.project.organizationId, schema.organization.id))
      .where(where),
  ]);

  return {
    data: rows,
    total: Number(total?.value ?? 0),
    page,
    perPage,
  };
}

async function activeDeploymentContainerIds(projectId: string, activeDeploymentId: string | null) {
  if (!activeDeploymentId) return { deployment: null, containerIds: [] as string[] };
  const deployment = await repos.deployment.findById(activeDeploymentId);
  if (!deployment || deployment.projectId !== projectId) {
    return { deployment: null, containerIds: [] as string[] };
  }
  const serviceDeployments = await repos.service.listByDeployment(activeDeploymentId);
  const containerIds = new Set<string>();
  if (deployment.containerId && deployment.containerId !== "compose") {
    containerIds.add(deployment.containerId);
  }
  for (const row of serviceDeployments) {
    if (row.containerId && row.containerId !== "compose") containerIds.add(row.containerId);
  }
  return { deployment, containerIds: [...containerIds] };
}

async function suspendedRouteOptions(
  project: { id: string; organizationId: string },
  serverId: string | null,
) {
  const domains = await repos.domain.listByProject(project.id);
  const dashboard = resolveDashboardPublicUrl();
  const server = serverId ? await repos.server.get(serverId) : null;
  const managedOriginHost = server?.routingId
    ? originHostnameForServer(
        server.routingId,
        process.env.VIBRAIL_MANAGED_DOMAIN ?? "vibrail.app",
      )
    : undefined;
  return {
    projectId: project.id,
    manual: await resolveTraefikManualConfig(project.organizationId, serverId ?? undefined),
    routes: domains
      .filter((domain) => domain.verified && domain.status === "active")
      .map((domain) => {
        const redirect = new URL(resolveDashboardPageUrl(dashboard, "/suspended"));
        redirect.searchParams.set("site", domain.hostname);
        return {
          hostname: domain.hostname,
          redirectUrl: redirect.toString(),
          ...(domain.domainType === "free" && managedOriginHost ? { managedOriginHost } : {}),
        };
      }),
  };
}

/** Rebuild route carriers after an API/host upgrade so projects that were
 * already suspended before this feature was deployed stop falling through to
 * Traefik's 404 without requiring an operator to resume+suspend them again. */
export async function reconcileSuspendedApplicationRoutes() {
  const projects = await db
    .select({
      id: schema.project.id,
      organizationId: schema.project.organizationId,
      activeDeploymentId: schema.project.activeDeploymentId,
    })
    .from(schema.project)
    .where(eq(schema.project.moderationStatus, "suspended"));
  let applied = 0;
  const warnings: string[] = [];

  for (const project of projects) {
    if (!project.activeDeploymentId) continue;
    try {
      const { deployment } = await activeDeploymentContainerIds(
        project.id,
        project.activeDeploymentId,
      );
      if (!deployment) continue;
      const { runtime, serverId } = await resolveDeploymentRuntime(deployment);
      if (!(runtime instanceof DockerRuntime)) continue;
      await runtime.publishSuspendedRoutes(await suspendedRouteOptions(project, serverId));
      applied += 1;
    } catch (err) {
      warnings.push(`${project.id}: ${safeErrorMessage(err)}`);
    }
  }
  return { total: projects.length, applied, warnings };
}

export async function suspendApplication(projectId: string, reason?: string) {
  const project = await repos.project.findById(projectId);
  if (!project) throw new NotFoundError("Project", projectId);
  if (project.appTemplateId === "vibrail") {
    throw new ForbiddenError("The Vibrail control plane cannot be suspended");
  }

  const normalizedReason = reason?.trim().slice(0, 500) || "";
  if (!normalizedReason) {
    throw new ValidationError("A suspension reason is required", {
      reason: ["Enter the policy violation or other reason shown to the project owner."],
    });
  }

  const suspendedAt = new Date();
  await repos.project.update(project.id, {
    moderationStatus: "suspended",
    suspendedAt,
    suspendedReason: normalizedReason,
  });

  const { deployment, containerIds } = await activeDeploymentContainerIds(
    project.id,
    project.activeDeploymentId,
  );
  let warning: string | null = null;
  if (deployment) {
    try {
      const { runtime, serverId } = await resolveDeploymentRuntime(deployment);
      const routeWarnings: string[] = [];
      for (const containerId of containerIds) {
        await runtime.stop(containerId).catch((err) => {
          routeWarnings.push(
            `could not stop ${containerId.slice(0, 12)}: ${safeErrorMessage(err)}`,
          );
        });
      }
      if (runtime instanceof DockerRuntime) {
        await runtime
          .publishSuspendedRoutes(await suspendedRouteOptions(project, serverId))
          .catch((err) =>
            routeWarnings.push(`could not publish suspension routes: ${safeErrorMessage(err)}`),
          );
      }
      if (routeWarnings.length > 0) {
        warning = `Project was marked suspended, but its public suspension route could not be fully applied: ${routeWarnings.join("; ")}`;
        console.warn(`[admin] ${project.id}: ${warning}`);
      }
    } catch (err) {
      warning = `Project was marked suspended, but its public suspension route could not be fully applied: ${safeErrorMessage(err)}`;
      console.warn(`[admin] ${project.id}: ${warning}`);
    }
  }

  let emailWarning: string | null = null;
  const [owner] = await db
    .select({ name: schema.user.name, email: schema.user.email })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(
      and(
        eq(schema.member.organizationId, project.organizationId),
        eq(schema.member.role, "owner"),
      ),
    )
    .orderBy(asc(schema.member.createdAt))
    .limit(1);

  if (owner?.email) {
    try {
      await sendMail({
        to: owner.email,
        organizationId: project.organizationId,
        ...projectSuspendedEmail({
          user: owner,
          projectName: project.name,
          reason: normalizedReason,
          supportEmail: getSupportEmail(),
        }),
      });
    } catch (err) {
      emailWarning = `The project owner notification could not be sent: ${safeErrorMessage(err)}`;
      console.warn(`[admin] ${project.id}: ${emailWarning}`);
    }
  } else {
    emailWarning = "The organization has no owner email to notify.";
  }

  return {
    beforeStatus: project.moderationStatus,
    project: {
      ...project,
      moderationStatus: "suspended",
      suspendedAt,
      suspendedReason: normalizedReason,
    },
    warning,
    emailWarning,
  };
}

export async function resumeModeratedWorkload(opts: {
  containerIds: string[];
  start: (containerId: string) => Promise<void>;
  stop: (containerId: string) => Promise<void>;
  removeSuspendedRoutes?: () => Promise<void>;
}): Promise<string[]> {
  const warnings: string[] = [];
  for (const containerId of opts.containerIds) {
    await opts.start(containerId).catch((err) => {
      warnings.push(`could not start ${containerId.slice(0, 12)}: ${safeErrorMessage(err)}`);
    });
  }
  if (opts.removeSuspendedRoutes) {
    try {
      await opts.removeSuspendedRoutes();
    } catch (err) {
      for (const containerId of opts.containerIds) await opts.stop(containerId).catch(() => {});
      throw err;
    }
  }
  return warnings;
}

export async function resumeApplication(projectId: string) {
  const project = await repos.project.findById(projectId);
  if (!project) throw new NotFoundError("Project", projectId);

  const { deployment, containerIds } = await activeDeploymentContainerIds(
    project.id,
    project.activeDeploymentId,
  );
  let runtimeWarnings: string[] = [];
  if (deployment) {
    const { runtime } = await resolveDeploymentRuntime(deployment);
    // Starting an old deployment is best-effort. Containers can legitimately
    // disappear while a project is suspended (host cleanup, migration, or an
    // interrupted replacement). That must not permanently trap the project in
    // moderation: once the suspension route is safely gone, the owner must be
    // able to redeploy it.
    runtimeWarnings = await resumeModeratedWorkload({
      containerIds,
      start: (containerId) => runtime.start(containerId),
      stop: (containerId) => runtime.stop(containerId),
      // The moderation override is the security boundary. If it cannot be
      // removed, keep the DB state suspended and roll back any starts so the
      // operation is safe and retryable.
      removeSuspendedRoutes:
        runtime instanceof DockerRuntime
          ? () => runtime.removeSuspendedRoutes(project.id)
          : undefined,
    });
  }

  await repos.project.update(project.id, {
    moderationStatus: "active",
    suspendedAt: null,
    suspendedReason: null,
  });
  return {
    beforeStatus: project.moderationStatus,
    project: { ...project, moderationStatus: "active", suspendedAt: null, suspendedReason: null },
    warning:
      runtimeWarnings.length > 0
        ? `The project was restored and can be redeployed, but its previous workload could not be fully restarted: ${runtimeWarnings.join("; ")}`
        : null,
  };
}

export async function listAccessLogs(opts: AdminListOptions & { path?: string }) {
  const { page, perPage, offset, search } = normalizeListOptions(opts);
  const filters: SQL[] = [];
  if (search) {
    const pattern = `%${search}%`;
    const searchFilter = or(
      ilike(schema.user.name, pattern),
      ilike(schema.user.email, pattern),
      ilike(schema.organization.name, pattern),
      ilike(schema.userAccessLog.path, pattern),
      ilike(schema.userAccessLog.ipAddress, pattern),
      ilike(schema.userAccessLog.userAgent, pattern),
    );
    if (searchFilter) filters.push(searchFilter);
  }
  if (opts.path) filters.push(ilike(schema.userAccessLog.path, `%${opts.path}%`));
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: schema.userAccessLog.id,
        userId: schema.userAccessLog.userId,
        userName: schema.user.name,
        userEmail: schema.user.email,
        userRole: schema.user.role,
        organizationId: schema.userAccessLog.organizationId,
        organizationName: schema.organization.name,
        sessionId: schema.userAccessLog.sessionId,
        path: schema.userAccessLog.path,
        referrer: schema.userAccessLog.referrer,
        ipAddress: schema.userAccessLog.ipAddress,
        userAgent: schema.userAccessLog.userAgent,
        createdAt: schema.userAccessLog.createdAt,
      })
      .from(schema.userAccessLog)
      .leftJoin(schema.user, eq(schema.userAccessLog.userId, schema.user.id))
      .leftJoin(
        schema.organization,
        eq(schema.userAccessLog.organizationId, schema.organization.id),
      )
      .where(where)
      .orderBy(desc(schema.userAccessLog.createdAt))
      .limit(perPage)
      .offset(offset),
    db
      .select({ value: count() })
      .from(schema.userAccessLog)
      .leftJoin(schema.user, eq(schema.userAccessLog.userId, schema.user.id))
      .leftJoin(
        schema.organization,
        eq(schema.userAccessLog.organizationId, schema.organization.id),
      )
      .where(where),
  ]);

  return { data: rows, total: Number(total?.value ?? 0), page, perPage };
}

export async function listActivityLogs(
  opts: AdminListOptions & { eventType?: string; actorUserId?: string },
) {
  const { page, perPage, offset, search } = normalizeListOptions(opts);
  const filters: SQL[] = [];
  if (opts.eventType) filters.push(eq(schema.auditEvent.eventType, opts.eventType));
  if (opts.actorUserId) filters.push(eq(schema.auditEvent.actorUserId, opts.actorUserId));
  if (search) {
    const pattern = `%${search}%`;
    const searchFilter = or(
      ilike(schema.auditEvent.eventType, pattern),
      ilike(schema.auditEvent.resourceType, pattern),
      ilike(schema.auditEvent.resourceId, pattern),
      ilike(schema.auditEvent.ipAddress, pattern),
      ilike(schema.user.name, pattern),
      ilike(schema.user.email, pattern),
      ilike(schema.organization.name, pattern),
    );
    if (searchFilter) filters.push(searchFilter);
  }
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: schema.auditEvent.id,
        organizationId: schema.auditEvent.organizationId,
        organizationName: schema.organization.name,
        actorUserId: schema.auditEvent.actorUserId,
        actorName: schema.user.name,
        actorEmail: schema.user.email,
        eventType: schema.auditEvent.eventType,
        resourceType: schema.auditEvent.resourceType,
        resourceId: schema.auditEvent.resourceId,
        before: schema.auditEvent.before,
        after: schema.auditEvent.after,
        ipAddress: schema.auditEvent.ipAddress,
        userAgent: schema.auditEvent.userAgent,
        createdAt: schema.auditEvent.createdAt,
      })
      .from(schema.auditEvent)
      .leftJoin(schema.user, eq(schema.auditEvent.actorUserId, schema.user.id))
      .leftJoin(schema.organization, eq(schema.auditEvent.organizationId, schema.organization.id))
      .where(where)
      .orderBy(desc(schema.auditEvent.createdAt))
      .limit(perPage)
      .offset(offset),
    db
      .select({ value: count() })
      .from(schema.auditEvent)
      .leftJoin(schema.user, eq(schema.auditEvent.actorUserId, schema.user.id))
      .leftJoin(schema.organization, eq(schema.auditEvent.organizationId, schema.organization.id))
      .where(where),
  ]);

  return { data: rows, total: Number(total?.value ?? 0), page, perPage };
}
