import { describe, expect, it } from "vitest";
import { planManagedDomainMigration, planServerRoutingIdMigration } from "./managed-domain-migration";

const projects = [{ id: "p1", slug: "My Blog", name: "My Blog", routeKey: "old123" }];

describe("managed domain data migration", () => {
  it("only rewrites explicitly free rows and produces stable 8-char hostnames", () => {
    const plan = planManagedDomainMigration({ projects, domains: [
      { id: "free", projectId: "p1", hostname: "my-blog-old123.vibrail.com", domainType: "free", managedKey: null },
      { id: "custom", projectId: "p1", hostname: "customer.vibrail.com", domainType: "custom", managedKey: null },
    ], generateKey: () => "k3m9x2ab" });
    expect(plan.updates).toEqual([{ domainId: "free", projectId: "p1", oldHostname: "my-blog-old123.vibrail.com", hostname: "my-blog-k3m9x2ab.vibrail.app", managedKey: "k3m9x2ab" }]);
  });
  it("is a no-op after apply", () => {
    const plan = planManagedDomainMigration({ projects: [{ ...projects[0], routeKey: "k3m9x2ab" }], domains: [{ id: "free", projectId: "p1", hostname: "my-blog-k3m9x2ab.vibrail.app", domainType: "free", managedKey: "k3m9x2ab" }] });
    expect(plan.updates).toEqual([]);
  });
  it("retries key collisions", () => {
    const keys = ["aaaaaaaa", "bbbbbbbb"];
    const plan = planManagedDomainMigration({ projects, domains: [
      { id: "occupied", projectId: "other", hostname: "other.vibrail.app", domainType: "custom", managedKey: "aaaaaaaa" },
      { id: "free", projectId: "p1", hostname: "my-blog.vibrail.com", domainType: "free", managedKey: null },
    ], generateKey: () => keys.shift()! });
    expect(plan.updates[0]?.managedKey).toBe("bbbbbbbb");
  });
});

describe("server routing ID data migration", () => {
  it("backfills only legacy rows with deterministic DNS-safe IDs", () => {
    expect(planServerRoutingIdMigration([
      { id: "legacy", routingId: null },
      { id: "current", routingId: "abc12345" },
    ], () => "0123abcddeadbeef")).toEqual([{ serverId: "legacy", routingId: "0123abcd" }]);
  });

  it("fails closed on invalid digests and collisions", () => {
    expect(() => planServerRoutingIdMigration([{ id: "legacy", routingId: null }], () => "not-hex!")).toThrow(/Invalid routing ID/);
    expect(() => planServerRoutingIdMigration([
      { id: "current", routingId: "0123abcd" },
      { id: "legacy", routingId: null },
    ], () => "0123abcdffff")).toThrow(/collision/);
  });
});
