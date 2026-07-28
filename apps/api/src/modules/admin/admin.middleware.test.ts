import { describe, expect, it } from "vitest";
import { canAccessInstanceAdmin } from "./admin.middleware";

describe("canAccessInstanceAdmin", () => {
  it("allows instance admins with browser or zero-auth sessions", () => {
    expect(canAccessInstanceAdmin("admin", "cookie")).toBe(true);
    expect(canAccessInstanceAdmin("admin", "zero-auth")).toBe(true);
  });

  it("denies organization roles that are not platform admins", () => {
    expect(canAccessInstanceAdmin("user", "cookie")).toBe(false);
    expect(canAccessInstanceAdmin(undefined, "cookie")).toBe(false);
  });

  it("never turns bearer credentials into global admin access", () => {
    expect(canAccessInstanceAdmin("admin", "bearer")).toBe(false);
  });
});
