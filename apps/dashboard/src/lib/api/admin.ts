import { api } from "./client";

export interface AdminOverview {
  users: {
    total: number;
    admins: number;
    verified: number;
    new24h: number;
    new7d: number;
    new30d: number;
  };
  activeUsers: { day: number; week: number; month: number; sessions: number };
  organizations: { total: number; teams: number };
  projects: number;
  deployments: { total: number; last7d: number; ready: number; failed: number };
  activityLast24h: number;
  periodMetrics: {
    rangeDays: AdminTrendRangeDays;
    newUsers: number;
    activeUsers: number;
    deployments: number;
    readyDeployments: number;
    failedDeployments: number;
    activity: number;
  };
  usageTrend: {
    timeZone: string;
    rangeDays: AdminTrendRangeDays;
    granularity: AdminTrendGranularity;
    points: Array<{ bucket: string; registrations: number; deployments: number }>;
  };
}

export type AdminTrendRangeDays = 7 | 14 | 30;
export type AdminTrendGranularity = "hour" | "day" | "week";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: string;
  emailVerified: boolean;
  autoProvisioned: boolean;
  createdAt: string;
  updatedAt: string;
  planTierId: "free" | "pro" | string;
  subscriptionInterval: "monthly" | "annual" | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  organizationCount: number;
  projectCount: number;
  deploymentCount: number;
  activeSessionCount: number;
  lastSeenAt: string | null;
  lastActionAt: string | null;
}

export interface AdminApplicationRow {
  id: string;
  name: string;
  appName: string;
  environmentName: string;
  environmentType: string;
  slug: string;
  framework: string | null;
  isApp: boolean;
  appTemplateId: string | null;
  gitProvider: string | null;
  gitOwner: string | null;
  gitRepo: string | null;
  cloudWorkspaceId: string | null;
  moderationStatus: "active" | "suspended";
  suspendedAt: string | null;
  suspendedReason: string | null;
  activeDeploymentId: string | null;
  organizationId: string;
  organizationName: string;
  ownerName: string | null;
  ownerEmail: string | null;
  primaryDomain: string | null;
  latestDeploymentId: string | null;
  latestDeploymentStatus: string | null;
  latestDeploymentUrl: string | null;
  latestDeploymentCreatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAccessLogRow {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  organizationId: string | null;
  organizationName: string | null;
  sessionId: string | null;
  path: string;
  referrer: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AdminActivityLogRow {
  id: string;
  organizationId: string;
  organizationName: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  eventType: string;
  resourceType: string | null;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AdminPage<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
}

export type AdminRuntimeConfig = {
  CLOUD_MAX_PROJECTS_PER_USER: number;
  CLOUD_SESSION_PINNING: "off" | "warn" | "strict";
  NOTIFY_WEBHOOK_ALLOW_INTERNAL: boolean;
  VIBRAIL_CLOUDFLARE_PROXY: boolean;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_PRO_MONTHLY_ID: string;
  STRIPE_PRICE_PRO_ANNUAL_ID: string;
  STRIPE_PRICE_PRO_MONTHLY_PROMOTIONAL_ID: string;
  STRIPE_PRICE_PRO_ANNUAL_PROMOTIONAL_ID: string;
};

export interface AdminRuntimeConfigState {
  values: AdminRuntimeConfig;
  overrides: Partial<AdminRuntimeConfig>;
  environmentDefaults: AdminRuntimeConfig;
}

function params(input: Record<string, string | number | boolean | undefined>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  ) as Record<string, string | number | boolean>;
}

export const adminApi = {
  async overview(input: {
    rangeDays?: AdminTrendRangeDays;
    granularity?: AdminTrendGranularity;
    timeZone?: string;
  } = {}): Promise<AdminOverview> {
    const response = await api.get<{ data: AdminOverview }>("admin/overview", {
      params: params(input),
    });
    return response.data;
  },

  users(input: {
    page?: number;
    perPage?: number;
    search?: string;
    role?: string;
    verified?: boolean;
  } = {}) {
    return api.get<AdminPage<AdminUserRow>>("admin/users", { params: params(input) });
  },

  updateUserPlan(userId: string, planTierId: "free" | "pro", period?: { periodStart: string; periodEnd: string; interval: "monthly" | "annual" }) {
    return api.patch<{ data: { organizationId: string; planTierId: "free" | "pro"; subscriptionInterval: "monthly" | "annual" | null; currentPeriodStart: string | null; currentPeriodEnd: string | null } }>(
      `admin/users/${userId}/plan`,
      { planTierId, ...period },
    );
  },

  applications(input: {
    page?: number;
    perPage?: number;
    search?: string;
    moderationStatus?: string;
    deploymentStatus?: string;
  } = {}) {
    return api.get<AdminPage<AdminApplicationRow>>("admin/apps", { params: params(input) });
  },

  suspendApplication(projectId: string, reason?: string) {
    return api.post<{ data: { warning: string | null; emailWarning: string | null } }>(`admin/apps/${projectId}/suspend`, {
      reason,
    });
  },

  resumeApplication(projectId: string) {
    return api.post<{ data: unknown }>(`admin/apps/${projectId}/resume`);
  },

  accessLogs(input: {
    page?: number;
    perPage?: number;
    search?: string;
    path?: string;
  } = {}) {
    return api.get<AdminPage<AdminAccessLogRow>>("admin/access-logs", {
      params: params(input),
    });
  },

  activityLogs(input: {
    page?: number;
    perPage?: number;
    search?: string;
    eventType?: string;
    actorUserId?: string;
  } = {}) {
    return api.get<AdminPage<AdminActivityLogRow>>("admin/activity-logs", {
      params: params(input),
    });
  },

  async runtimeConfig(): Promise<AdminRuntimeConfigState> {
    const response = await api.get<{ data: AdminRuntimeConfigState }>("admin/runtime-config");
    return response.data;
  },

  async updateRuntimeConfig(
    patch: Partial<{ [K in keyof AdminRuntimeConfig]: AdminRuntimeConfig[K] | null }>,
  ): Promise<AdminRuntimeConfigState> {
    const response = await api.patch<{ data: AdminRuntimeConfigState }>(
      "admin/runtime-config",
      patch,
    );
    return response.data;
  },
};
