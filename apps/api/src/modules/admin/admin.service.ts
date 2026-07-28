import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db, schema } from "@repo/db";

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
  return Number.isFinite(value)
    ? Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(value)))
    : 50;
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
  const granularity = TREND_GRANULARITIES.includes(
    opts.granularity as AdminTrendGranularity,
  )
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
    for (let cursor = firstCalendarDay.getTime(); cursor <= endHour.getTime(); cursor += 60 * 60 * 1000) {
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

export async function listUsers(
  opts: AdminListOptions & { role?: string; verified?: boolean },
) {
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
        )`,
        lastActionAt: sql<Date | null>`(
          select max(a.created_at) from ${schema.auditEvent} a where a.actor_user_id = ${outerUserId}
        )`,
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
      .leftJoin(schema.organization, eq(schema.userAccessLog.organizationId, schema.organization.id))
      .where(where)
      .orderBy(desc(schema.userAccessLog.createdAt))
      .limit(perPage)
      .offset(offset),
    db
      .select({ value: count() })
      .from(schema.userAccessLog)
      .leftJoin(schema.user, eq(schema.userAccessLog.userId, schema.user.id))
      .leftJoin(schema.organization, eq(schema.userAccessLog.organizationId, schema.organization.id))
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
