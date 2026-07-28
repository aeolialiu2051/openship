import { describe, expect, it } from "vitest";
import { mergeCanonicalInstanceUser } from "./auth.controller";

describe("mergeCanonicalInstanceUser", () => {
  it("overrides stale cookie-cached instance fields with database values", () => {
    expect(
      mergeCanonicalInstanceUser(
        {
          id: "user_1",
          email: "admin@example.com",
          role: "user",
          autoProvisioned: false,
        },
        { role: "admin", autoProvisioned: true },
      ),
    ).toEqual({
      id: "user_1",
      email: "admin@example.com",
      role: "admin",
      autoProvisioned: true,
    });
  });

  it("applies role revocations immediately as well", () => {
    expect(
      mergeCanonicalInstanceUser(
        { id: "user_1", role: "admin" },
        { role: "user", autoProvisioned: false },
      ).role,
    ).toBe("user");
  });
});
