import { describe, expect, it } from "vitest";
import {
  APP_CLOUD_INSTALL_AVAILABLE,
  canUseLocalAppDestination,
} from "./app-destination-availability";

describe("app destination availability", () => {
  it("keeps This machine available for desktop installs that opt in", () => {
    expect(canUseLocalAppDestination({ allowLocal: true, deployMode: "desktop" })).toBe(true);
  });

  it("hides This machine on a server-hosted Openship instance", () => {
    expect(canUseLocalAppDestination({ allowLocal: true, deployMode: "docker" })).toBe(false);
  });

  it("does not expose This machine to flows that do not opt in", () => {
    expect(canUseLocalAppDestination({ allowLocal: false, deployMode: "desktop" })).toBe(false);
  });

  it("keeps Openship Cloud app installation in coming-soon state", () => {
    expect(APP_CLOUD_INSTALL_AVAILABLE).toBe(false);
  });
});
