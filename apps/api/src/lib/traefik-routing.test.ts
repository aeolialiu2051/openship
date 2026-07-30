import { describe, expect, it } from "vitest";
import { vibrailRouterName } from "./traefik-router-name";

describe("vibrailRouterName", () => {
  it("keeps different hostnames unique when service and port match", () => {
    expect(vibrailRouterName("project", "service", "3000", "a.example.com")).not.toBe(
      vibrailRouterName("project", "service", "3000", "b.example.com"),
    );
  });

  it("keeps long names bounded without discarding the distinguishing suffix", () => {
    const first = vibrailRouterName("project", "x".repeat(80), "a.example.com");
    const second = vibrailRouterName("project", "x".repeat(80), "b.example.com");
    expect(first.length).toBeLessThanOrEqual(63);
    expect(second.length).toBeLessThanOrEqual(63);
    expect(first).not.toBe(second);
  });
});
