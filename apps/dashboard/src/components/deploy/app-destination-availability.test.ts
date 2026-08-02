import { describe, expect, it } from "vitest";
import {
  APP_CLOUD_INSTALL_AVAILABLE,
  hasBuildLocationChoice,
  canUseLocalBuildLocation,
  canUseLocalAppDestination,
} from "./app-destination-availability";

describe("app destination availability", () => {
  it("keeps This machine available for desktop installs that opt in", () => {
    expect(canUseLocalAppDestination({ allowLocal: true, deployMode: "desktop" })).toBe(true);
  });

  it("hides This machine on a server-hosted Vibrail instance", () => {
    expect(canUseLocalAppDestination({ allowLocal: true, deployMode: "docker" })).toBe(false);
  });

  it("does not expose This machine to flows that do not opt in", () => {
    expect(canUseLocalAppDestination({ allowLocal: false, deployMode: "desktop" })).toBe(false);
  });

  it("keeps Vibrail Cloud app installation in coming-soon state", () => {
    expect(APP_CLOUD_INSTALL_AVAILABLE).toBe(false);
  });

  it("allows local builds on operator-controlled hosts", () => {
    expect(canUseLocalBuildLocation({ deployMode: "desktop" })).toBe(true);
    expect(canUseLocalBuildLocation({ deployMode: "docker" })).toBe(true);
    expect(canUseLocalBuildLocation({ deployMode: "bare" })).toBe(true);
  });

  it("hides local builds in managed cloud mode", () => {
    expect(canUseLocalBuildLocation({ deployMode: "cloud" })).toBe(false);
  });

  it("fails closed for unknown deployment modes", () => {
    expect(canUseLocalBuildLocation({ deployMode: "future-mode" })).toBe(false);
  });

  it("hides the build-location picker when only one location is available", () => {
    expect(hasBuildLocationChoice(0)).toBe(false);
    expect(hasBuildLocationChoice(1)).toBe(false);
    expect(hasBuildLocationChoice(2)).toBe(true);
  });
});
