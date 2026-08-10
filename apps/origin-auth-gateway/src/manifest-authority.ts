import { readFile, readdir } from "node:fs/promises";
import type { DeploymentAuthority } from "./index";

type ManifestRoute = { hostname: string; project_id: string; service_id: string | null; server_id: string; version: number; enabled: boolean };

export class FileDeploymentAuthority implements DeploymentAuthority {
  private cached: { expiresAt: number; routes: ManifestRoute[] } | null = null;
  constructor(private readonly path = "/etc/vibrail/edge-routes", private readonly cacheMs = 1_000) {}
  private async routes(): Promise<ManifestRoute[]> {
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.routes;
    const files = (await readdir(this.path).catch(() => [])).filter((name) => name.endsWith(".json"));
    const routes: ManifestRoute[] = [];
    for (const file of files) {
      try { routes.push(JSON.parse(await readFile(`${this.path}/${file}`, "utf8")) as ManifestRoute); } catch { /* malformed entries fail closed */ }
    }
    this.cached = { expiresAt: Date.now() + this.cacheMs, routes };
    return routes;
  }
  async isCurrent(input: { hostname: string; projectId: string; serviceId: string | null; serverId: string; routeVersion: number }): Promise<boolean> {
    return (await this.routes()).some((route) => route.enabled && route.hostname.toLowerCase() === input.hostname && route.project_id === input.projectId && route.service_id === input.serviceId && route.server_id === input.serverId && route.version >= input.routeVersion);
  }
}
