import { describe, expect, it } from "vitest";
import {
  assertValidServerRoutingId,
  generateManagedDomain,
  isReservedServerHostname,
  managedDomainSlug,
  originHostnameForServer,
  parseEdgeRoute,
  randomManagedKey,
  routeSignaturePayload,
} from "../src/managed-routing";

describe("managed domains", () => {
  it.each([
    ["My Blog", "my-blog"],
    ["中文项目", "app"],
    ["--- API__Service!!! ", "api-service"],
    ["", "app"],
    ["A---B", "a-b"],
    ["UPPER case", "upper-case"],
  ])("normalizes %j", (input, expected) => expect(managedDomainSlug(input)).toBe(expected));

  it("caps slugs at 32 characters without a trailing separator", () => {
    const slug = managedDomainSlug(`${"a".repeat(31)}--tail`);
    expect(slug).toHaveLength(31);
    expect(slug).not.toMatch(/-$/);
  });

  it("creates stable hostnames when a key is persisted", () => {
    expect(generateManagedDomain("My Blog", { key: "k3m9x2ab" })).toEqual({
      slug: "my-blog",
      key: "k3m9x2ab",
      hostname: "my-blog-k3m9x2ab.vibrail.app",
    });
  });

  it("uses unbiased lowercase base36 keys", () => {
    let byte = 0;
    const key = randomManagedKey((length) => Uint8Array.from({ length }, () => byte++));
    expect(key).toMatch(/^[a-z0-9]{8}$/);
  });
});

describe("edge routing safety", () => {
  it("only accepts DNS-safe server routing IDs", () => {
    expect(assertValidServerRoutingId("a17f3")).toBe("a17f3");
    for (const value of ["https://evil.test", "a.b", "a/b", "-bad", "bad-"]) {
      expect(() => assertValidServerRoutingId(value)).toThrow();
    }
  });

  it("derives origins instead of accepting URLs", () => {
    expect(originHostnameForServer("001")).toBe("server-001.vibrail.app");
    expect(isReservedServerHostname("server-001.vibrail.app")).toBe(true);
  });

  it("validates versioned route projections", () => {
    const route = { project_id: "proj_1", service_id: null, server_id: "001", enabled: true, version: 3, updated_at: new Date().toISOString() };
    expect(parseEdgeRoute(route)).toEqual(route);
    expect(() => parseEdgeRoute({ ...route, version: 0 })).toThrow();
    expect(() => parseEdgeRoute({ ...route, server_id: "https://evil.test" })).toThrow();
  });

  it("canonicalizes every security-sensitive field", () => {
    expect(routeSignaturePayload({ method: "get", hostname: "App.Example.com", pathAndQuery: "/a?b=1", projectId: "p", serviceId: null, serverId: "001", routeVersion: 2, timestamp: "10", nonce: "n" }))
      .toBe("GET\napp.example.com\n/a?b=1\np\n\n001\n2\n10\nn");
  });
});
