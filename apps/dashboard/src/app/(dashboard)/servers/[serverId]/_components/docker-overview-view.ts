import type { DockerContainerOverview, DockerOverviewResponse } from "@/lib/api/system";

export type DockerContainerGroup = {
  key: string;
  name: string;
  kind: "project" | "compose" | "standalone";
  isApp?: boolean;
  containers: DockerContainerOverview[];
};

function sortContainers(containers: DockerContainerOverview[]) {
  return [...containers].sort(
    (a, b) => Number(b.running) - Number(a.running) || a.name.localeCompare(b.name),
  );
}

/**
 * Present every Docker container under the closest project identity we have:
 * a Vibrail project first, then a native Compose project, with truly
 * unlabelled containers collected into one standalone group.
 */
export function groupDockerContainers(data: DockerOverviewResponse): DockerContainerGroup[] {
  const projectsById = new Map(data.projects.map((project) => [project.id, project]));
  const groups = new Map<string, DockerContainerGroup>();

  for (const container of data.containers) {
    const project = container.projectId ? projectsById.get(container.projectId) : undefined;
    const key = project
      ? `project:${project.id}`
      : container.composeProject
        ? `compose:${container.composeProject}`
        : "standalone";

    let group = groups.get(key);
    if (!group) {
      group = project
        ? {
            key,
            name: project.name,
            kind: "project",
            isApp: project.isApp,
            containers: [],
          }
        : container.composeProject
          ? {
              key,
              name: container.composeProject,
              kind: "compose",
              containers: [],
            }
          : {
              key,
              name: "",
              kind: "standalone",
              containers: [],
            };
      groups.set(key, group);
    }
    group.containers.push(container);
  }

  return [...groups.values()]
    .map((group) => ({ ...group, containers: sortContainers(group.containers) }))
    .sort((a, b) => {
      if (a.kind === "standalone") return 1;
      if (b.kind === "standalone") return -1;
      if (a.kind !== b.kind) return a.kind === "project" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}
