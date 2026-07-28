import { describe, expect, it } from "vitest";
import { isOblienBackedDeployment } from "../../src/lib/platform-mode";

describe("isOblienBackedDeployment", () => {
  it("prefers an explicit user server over process-wide cloud mode", () => {
    expect(isOblienBackedDeployment("cloud", "srv_user_owned")).toBe(false);
  });

  it("treats an explicit server deploy target as self-hosted", () => {
    expect(isOblienBackedDeployment("server", null)).toBe(false);
  });
});
