import type { SystemComponentDefinition } from "./types";

export const SYSTEM_COMPONENTS: SystemComponentDefinition[] = [
  {
    name: "docker",
    label: "Docker",
    description: "Container runtime for deployments",
    installable: true,
    category: "core",
  },
  {
    name: "git",
    label: "Git",
    description: "Version control for source code",
    installable: true,
    category: "core",
  },
  {
    name: "traefik",
    label: "Traefik",
    description: "Reverse proxy and managed TLS edge",
    installable: false,
    category: "infrastructure",
  },
  {
    name: "certbot",
    label: "Certbot",
    description: "Let's Encrypt certificate management client",
    installable: true,
    category: "infrastructure",
  },
  {
    name: "ssl-certificates",
    label: "SSL certificates",
    description: "Certificates found in Traefik ACME or Certbot storage",
    installable: false,
    category: "infrastructure",
  },
  {
    name: "rsync",
    label: "rsync",
    description: "Fast directory sync for remote local-build transfers",
    installable: true,
    category: "infrastructure",
  },
];

export const SYSTEM_COMPONENTS_BY_NAME = new Map(
  SYSTEM_COMPONENTS.map((component) => [component.name, component]),
);

export function getSystemComponentDefinition(
  name: string,
): SystemComponentDefinition {
  return (
    SYSTEM_COMPONENTS_BY_NAME.get(name) ?? {
      name,
      label: name,
      description: `${name} component`,
      installable: false,
      category: "infrastructure" as const,
    }
  );
}
