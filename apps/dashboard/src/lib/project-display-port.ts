import type { Service } from "@/lib/api/services";

function validPort(value: unknown): number | null {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function primaryService(services: readonly Service[]): Service | undefined {
  return [...services]
    .filter((service) => service.enabled !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
}

/** Container-side application port, e.g. 8317 from 127.0.0.1:8317:8317. */
export function serviceContainerPort(service?: Service): number | null {
  const explicit = validPort(service?.exposedPort);
  if (explicit) return explicit;

  const spec = service?.ports?.[0];
  if (!spec) return null;
  return validPort(spec.split(":").at(-1)?.split("/")[0]);
}

/** Published host port, e.g. 8080 from 127.0.0.1:8080:3000. */
export function serviceHostPort(service?: Service): number | null {
  const spec = service?.ports?.[0];
  if (spec) {
    const parts = spec.split(":");
    if (parts.length >= 2) {
      const published = validPort(parts.at(-2));
      if (published) return published;
    }
  }
  return serviceContainerPort(service);
}

export function projectContainerPort(services: readonly Service[], projectPort: unknown): number {
  return serviceContainerPort(primaryService(services)) ?? validPort(projectPort) ?? 3000;
}

export function projectHostPort(services: readonly Service[], projectPort: unknown): number {
  return serviceHostPort(primaryService(services)) ?? validPort(projectPort) ?? 3000;
}
