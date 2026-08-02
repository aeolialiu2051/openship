import { describe, it, expect } from "vitest";
import type { DockerContainerDetail } from "@repo/adapters";
import type { ManifestProjectEntry } from "../../lib/vibrail-manifest";
import {
  reconcileVibrailProjects,
  isBuildHelper,
  discoveredServiceName,
  vibrailStackName,
} from "./docker-reconcile";

describe("isBuildHelper", () => {
  it("is true only for a transient builder (vibrail.build, no deployment/service)", () => {
    expect(isBuildHelper({ "vibrail.project": "p", "vibrail.build": "s1" })).toBe(true);
  });

  it("is FALSE for a real app container that merely inherited vibrail.build from its bld_ image", () => {
    // The bug: locally-built app containers carry vibrail.build (image-inherited)
    // but also vibrail.deployment/service — they are NOT build helpers.
    expect(
      isBuildHelper({
        "vibrail.project": "p",
        "vibrail.build": "s1",
        "vibrail.deployment": "dep_1",
        "vibrail.service": "svc_1",
      }),
    ).toBe(false);
  });

  it("is false for containers with no vibrail.build (registry images like redis/postgres)", () => {
    expect(isBuildHelper({ "vibrail.project": "p" })).toBe(false);
    expect(isBuildHelper({})).toBe(false);
  });
});

function container(over: Partial<DockerContainerDetail> & { labels: Record<string, string> }): DockerContainerDetail {
  return {
    id: over.id ?? "c1",
    name: over.name ?? "svc",
    image: over.image ?? "postgres:17",
    imageId: "sha256:abc",
    state: over.state ?? "running",
    env: over.env ?? [],
    networks: over.networks ?? [],
    mounts: over.mounts ?? [],
    ports: over.ports ?? [],
    ...over,
  };
}

function manifestEntry(over: Partial<ManifestProjectEntry> & { id: string }): ManifestProjectEntry {
  return {
    slug: "slug",
    name: "Name",
    organizationId: "org_1",
    groupId: "app_1",
    domains: [],
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("reconcileVibrailProjects", () => {
  it("recovers an orphaned project and enriches name/slug/domains from the manifest", () => {
    const details = [
      container({
        id: "c1",
        name: "web",
        image: "myapp:latest",
        labels: { "vibrail.project": "proj_abc", "vibrail.service": "web", "vibrail.deployment": "dep_1" },
      }),
      container({
        id: "c2",
        name: "db",
        labels: { "vibrail.project": "proj_abc", "vibrail.service": "db" },
      }),
    ];
    const manifestById = new Map<string, ManifestProjectEntry>([
      ["proj_abc", manifestEntry({
        id: "proj_abc",
        name: "Shop",
        slug: "shop",
        routeKey: "oo198w",
        domains: ["shop.example.com"],
      })],
    ]);

    const out = reconcileVibrailProjects({ managedDetails: details, manifestById, knownHereIds: new Set(), snapshotIds: new Set() });
    expect(out).toHaveLength(1);
    const p = out[0]!;
    expect(p).toMatchObject({
      projectId: "proj_abc",
      knownHere: false,
      suggestedName: "Shop",
      slug: "shop",
      routeKey: "oo198w",
    });
    expect(p.domains).toEqual(["shop.example.com"]);
    expect(p.deploymentId).toBe("dep_1");
    expect(p.services.map((s) => s.name).sort()).toEqual(["db", "web"]);
  });

  it("flags a project already present in this DB as knownHere", () => {
    const details = [
      container({ labels: { "vibrail.project": "proj_known", "vibrail.service": "web" } }),
    ];
    const out = reconcileVibrailProjects({
      managedDetails: details,
      manifestById: null,
      knownHereIds: new Set(["proj_known"]),
      snapshotIds: new Set(),
    });
    expect(out[0]!.knownHere).toBe(true);
  });

  it("excludes build-helper containers (vibrail.build) from services", () => {
    const details = [
      container({ id: "c1", name: "web", labels: { "vibrail.project": "proj_x", "vibrail.service": "web" } }),
      container({ id: "c2", name: "build", labels: { "vibrail.project": "proj_x", "vibrail.build": "sess_1" } }),
    ];
    const out = reconcileVibrailProjects({ managedDetails: details, manifestById: null, knownHereIds: new Set(), snapshotIds: new Set() });
    expect(out).toHaveLength(1);
    expect(out[0]!.services).toHaveLength(1);
    expect(out[0]!.services[0]!.name).toBe("web");
  });

  it("falls back to a derived name when no manifest entry exists", () => {
    const details = [
      container({ name: "api", labels: { "vibrail.project": "proj_deadbeef00", "vibrail.service": "api" } }),
    ];
    const out = reconcileVibrailProjects({ managedDetails: details, manifestById: null, knownHereIds: new Set(), snapshotIds: new Set() });
    expect(out[0]!.suggestedName).toBe("vibrail-deadbeef");
    expect(out[0]!.slug).toBeUndefined();
  });

  it("recovers a single-app container that carries no vibrail.service label", () => {
    const details = [
      container({ id: "c1", name: "web-1", labels: { "vibrail.project": "proj_single", "vibrail.deployment": "dep_9" } }),
    ];
    const out = reconcileVibrailProjects({ managedDetails: details, manifestById: null, knownHereIds: new Set(), snapshotIds: new Set() });
    expect(out[0]!.services).toHaveLength(1);
    // No service label → the service name falls back to the container name.
    expect(out[0]!.services[0]!.name).toBe("web-1");
  });

  it("ignores containers with no vibrail.project label", () => {
    const details = [container({ labels: { "vibrail.network": "shop" } })];
    const out = reconcileVibrailProjects({ managedDetails: details, manifestById: null, knownHereIds: new Set(), snapshotIds: new Set() });
    expect(out).toEqual([]);
  });
});

describe("discoveredServiceName — migrated container → compose-service mapping", () => {
  it("maps a Vibrail-deployed container to its vibrail.service name (no compose label)", () => {
    // The exact same-server migration case: container named vibrail-vibrail-web
    // carrying vibrail.service=web MUST adopt as "web", so the git-compose
    // reconcile updates it in place instead of creating a duplicate bare-name row.
    expect(
      discoveredServiceName(
        {
          name: "vibrail-vibrail-web",
          labels: { "vibrail.project": "p1", "vibrail.service": "web", "vibrail.deployment": "d1" },
        },
        undefined,
      ),
    ).toBe("web");
  });

  it("prefers an explicit compose-file declaration over any label", () => {
    expect(
      discoveredServiceName(
        { name: "c", composeService: "api", labels: { "vibrail.service": "web" } },
        { name: "declared" },
      ),
    ).toBe("declared");
  });

  it("uses the real com.docker.compose.service label before vibrail.service", () => {
    expect(
      discoveredServiceName({ name: "c", composeService: "db", labels: { "vibrail.service": "x" } }, undefined),
    ).toBe("db");
  });

  it("falls back to the container name when nothing identifies the service", () => {
    expect(discoveredServiceName({ name: "some-container", labels: {} }, undefined)).toBe("some-container");
    expect(discoveredServiceName({ name: "bare" }, undefined)).toBe("bare");
  });
});

describe("vibrailStackName — group Vibrail-deployed containers by their stack", () => {
  it("derives the stack slug from vibrail-<slug>-<service>", () => {
    expect(vibrailStackName("vibrail-supabase-kong", "kong")).toBe("supabase");
    expect(vibrailStackName("vibrail-vibrail-web", "web")).toBe("vibrail");
    expect(vibrailStackName("vibrail-clincai-api", "api")).toBe("clincai");
  });

  it("handles hyphenated service names via the exact service label", () => {
    // Without the exact label, naive splitting would mis-derive "mongodb-mongo".
    expect(vibrailStackName("vibrail-mongodb-mongo-express", "mongo-express")).toBe("mongodb");
    expect(vibrailStackName("vibrail-mongodb-mongo", "mongo")).toBe("mongodb");
  });

  it("returns null for a non-Vibrail / unidentifiable container (→ standalone)", () => {
    expect(vibrailStackName("my-random-container", undefined)).toBeNull();
    expect(vibrailStackName(undefined, "web")).toBeNull();
    // Name that doesn't end in the service label → not our pattern.
    expect(vibrailStackName("vibrail-supabase-kong", "web")).toBeNull();
  });
});
