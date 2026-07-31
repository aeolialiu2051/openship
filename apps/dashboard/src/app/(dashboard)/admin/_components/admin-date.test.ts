import { describe, expect, it } from "vitest";
import { parseAdminDate } from "./admin-date";

describe("parseAdminDate", () => {
  it("treats legacy timezone-less admin timestamps as UTC", () => {
    expect(parseAdminDate("2026-08-01 04:40:00")?.toISOString()).toBe(
      "2026-08-01T04:40:00.000Z",
    );
  });

  it("preserves timestamps that already include a time-zone offset", () => {
    expect(parseAdminDate("2026-08-01T12:40:00+08:00")?.toISOString()).toBe(
      "2026-08-01T04:40:00.000Z",
    );
  });

  it("rejects missing and invalid timestamps", () => {
    expect(parseAdminDate(null)).toBeNull();
    expect(parseAdminDate("not-a-date")).toBeNull();
  });
});
