import { describe, expect, it } from "vitest";
import { serializeDomain } from "./domain.controller";

describe("domain API serialization", () => {
  it("returns the complete managed URL and edge status without changing fields", () => {
    expect(serializeDomain({
      hostname: "my-blog-k3m9x2ab.vibrail.app",
      domainType: "free",
      routeStatus: "active",
    })).toEqual({
      hostname: "my-blog-k3m9x2ab.vibrail.app",
      url: "https://my-blog-k3m9x2ab.vibrail.app",
      domainType: "free",
      routeStatus: "active",
    });
  });
});
