import { describe, expect, test } from "vitest";
import {
  inheritSoleProjectRouteForService,
  storedPublicEndpointsNeedCloud,
} from "./public-endpoints";
import { getRoutingBaseDomain } from "./routing-domains";

// The Cloud gate must classify by the HOSTNAME's physical truth, not a bare
// `domainType` string. Regression for: removing a migrated custom-domain route
// wrongly demanded "Connect Openship Cloud to use a free subdomain" because the
// stale row's domainType wasn't stamped "custom".
describe("storedPublicEndpointsNeedCloud", () => {
  const base = getRoutingBaseDomain();

  test("empty / null → no Cloud needed", () => {
    expect(storedPublicEndpointsNeedCloud([])).toBe(false);
    expect(storedPublicEndpointsNeedCloud(null)).toBe(false);
    expect(storedPublicEndpointsNeedCloud(undefined)).toBe(false);
  });

  test("a managed free subdomain (bare slug) needs Cloud — even with domainType unset", () => {
    expect(storedPublicEndpointsNeedCloud([{ domain: "myapp", domainType: "free" }])).toBe(true);
    expect(
      storedPublicEndpointsNeedCloud([{ domain: "myapp", domainType: undefined as never }]),
    ).toBe(true);
  });

  test("a real custom host NEVER needs Cloud, whatever the domainType says", () => {
    // the exact bug: migrated custom domain, domainType not stamped
    expect(
      storedPublicEndpointsNeedCloud([
        { customDomain: "api.openship.io", domainType: undefined as never },
      ]),
    ).toBe(false);
    // even if a stale row (wrongly) marked it free — the hostname is the truth
    expect(
      storedPublicEndpointsNeedCloud([
        { customDomain: "api.openship.io", domainType: "free" as never },
      ]),
    ).toBe(false);
    // ...or the host was misfiled into the free `domain` field as a full host
    expect(
      storedPublicEndpointsNeedCloud([
        { domain: "api.openship.io", domainType: undefined as never },
      ]),
    ).toBe(false);
  });

  test("a *.<base> host still needs Cloud — it only resolves behind the Cloud edge", () => {
    expect(
      storedPublicEndpointsNeedCloud([
        { customDomain: `myapp.${base}`, domainType: "custom" as never },
      ]),
    ).toBe(true);
  });

  test("mixed set → Cloud needed iff any endpoint is a managed free subdomain", () => {
    expect(
      storedPublicEndpointsNeedCloud([
        { customDomain: "api.openship.io", domainType: "custom" },
        { domain: "dash", domainType: "free" },
      ]),
    ).toBe(true);
    expect(
      storedPublicEndpointsNeedCloud([
        { customDomain: "api.openship.io", domainType: "custom" },
        { customDomain: "app.clincai.com", domainType: "custom" },
      ]),
    ).toBe(false);
  });
});

describe("inheritSoleProjectRouteForService", () => {
  const routeLessService = {
    id: "svc_3xui",
    enabled: true,
    exposed: true,
    exposedPort: "2053",
    ports: ["2053:2053"],
    domain: null,
    customDomain: null,
    domainType: "free",
    publicEndpoints: [],
  };
  const projectRoute = {
    hostname: "3x-ui-jgq7ab.vibrail.warpgateapi.com",
    isPrimary: true,
    verified: true,
    serviceId: null,
    targetPort: 2053,
    targetPath: null,
    domainType: "free",
  };

  test("inherits the sole matching project route for a production service", () => {
    expect(inheritSoleProjectRouteForService([routeLessService], [projectRoute])).toEqual({
      serviceId: "svc_3xui",
      endpoint: { port: 2053, domain: "3x-ui-jgq7ab", domainType: "free" },
    });
  });

  test("does not guess when multiple services could own the route", () => {
    expect(
      inheritSoleProjectRouteForService(
        [routeLessService, { ...routeLessService, id: "svc_other" }],
        [projectRoute],
      ),
    ).toBeNull();
  });

  test("does not inherit a project route targeting a different port", () => {
    expect(
      inheritSoleProjectRouteForService(
        [routeLessService],
        [{ ...projectRoute, targetPort: 8080 }],
      ),
    ).toBeNull();
  });
});
