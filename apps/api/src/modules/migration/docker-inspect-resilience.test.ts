import { describe, expect, it } from "vitest";
import type { DockerContainerDetail, DockerContainerSummary } from "@repo/adapters";
import { inspectDiscoveredContainers } from "./docker-inspect.service";

function summary(id: string, name: string): DockerContainerSummary {
  return {
    id,
    names: [name],
    image: `${name}:latest`,
    imageId: `sha256:${id}`,
    state: "running",
    status: "Up",
    labels: {},
    ports: [],
    mounts: [],
  };
}

function detail(id: string, name: string): DockerContainerDetail {
  return {
    id,
    name,
    image: `${name}:latest`,
    imageId: `sha256:${id}`,
    state: "running",
    env: [],
    labels: {},
    networks: [],
    mounts: [],
    ports: [],
  };
}

describe("inspectDiscoveredContainers", () => {
  it("returns successful containers when one inspect has a network error", async () => {
    const result = await inspectDiscoveredContainers(
      [summary("one", "web"), summary("two", "db")],
      [],
      async (id) => {
        if (id === "two") throw new Error("Network error");
        return detail(id, "web");
      },
    );

    expect(result.details.map((container) => container.name)).toEqual(["web"]);
    expect(result.failures).toEqual(["db: Network error"]);
  });

  it("fails with context when no discovered container can be inspected", async () => {
    await expect(
      inspectDiscoveredContainers([summary("one", "web")], [], async () => {
        throw new Error("Network error");
      }),
    ).rejects.toThrow("Could not inspect any of the 1 discovered containers. web: Network error");
  });
});
