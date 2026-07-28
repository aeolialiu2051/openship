import { describe, expect, it } from "vitest";
import { getOverview, listUsers } from "./admin.service";

describe("admin user listing", () => {
  it("executes correlated user-stat queries without ambiguous columns", async () => {
    const result = await listUsers({
      page: 1,
      perPage: 25,
      search: "__admin_user_query_probe_that_matches_nothing__",
    });

    expect(result).toMatchObject({
      data: [],
      total: 0,
      page: 1,
      perPage: 25,
    });
  });

  it("groups overview data in the requested browser time zone", async () => {
    const overview = await getOverview({ timeZone: "America/New_York" });

    expect(overview.usageTrend).toMatchObject({
      rangeDays: 14,
      granularity: "day",
    });
    expect(overview.periodMetrics).toMatchObject({
      rangeDays: 14,
      newUsers: 0,
      activeUsers: 0,
      deployments: 0,
      readyDeployments: 0,
      failedDeployments: 0,
      activity: 0,
    });
    expect(overview.usageTrend.timeZone).toBe("America/New_York");
    expect(overview.usageTrend.points).toHaveLength(14);
    expect(
      overview.usageTrend.points.every((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.bucket)),
    ).toBe(true);
  });

  it("supports hourly trend buckets and validates preference values", async () => {
    const hourly = await getOverview({ rangeDays: 7, granularity: "hour" });
    expect(hourly.usageTrend.rangeDays).toBe(7);
    expect(hourly.usageTrend.granularity).toBe("hour");
    expect(hourly.periodMetrics.rangeDays).toBe(7);
    expect(hourly.usageTrend.points.length).toBeGreaterThan(24);
    expect(hourly.usageTrend.points.every((point) => point.bucket.endsWith(":00"))).toBe(true);

    const fallback = await getOverview({ rangeDays: 999, granularity: "minute" });
    expect(fallback.usageTrend).toMatchObject({ rangeDays: 14, granularity: "day" });

    const invalidTimeZone = await getOverview({ timeZone: "not/a-real-time-zone" });
    expect(invalidTimeZone.usageTrend.timeZone).toBeTruthy();
    expect(invalidTimeZone.usageTrend.timeZone).not.toBe("not/a-real-time-zone");
  });
});
