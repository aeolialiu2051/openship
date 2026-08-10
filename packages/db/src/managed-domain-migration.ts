import { appendProjectRouteKey, generateProjectRouteKey, managedDomainSlug } from "@repo/core";

export type LegacyProject = { id: string; slug: string; name: string; routeKey: string | null };
export type LegacyDomain = { id: string; projectId: string | null; hostname: string; domainType: string | null; managedKey: string | null };
export type ManagedDomainMigrationUpdate = { domainId: string; projectId: string; oldHostname: string; hostname: string; managedKey: string };
export type ManagedServerMigrationRow = { id: string; routingId: string | null };

export function planServerRoutingIdMigration(
  servers: ManagedServerMigrationRow[],
  digest: (value: string) => string,
): Array<{ serverId: string; routingId: string }> {
  const used = new Set(servers.flatMap((row) => row.routingId ? [row.routingId.toLowerCase()] : []));
  const updates: Array<{ serverId: string; routingId: string }> = [];
  for (const server of servers) {
    if (server.routingId) continue;
    const routingId = digest(server.id).slice(0, 8).toLowerCase();
    if (!/^[a-f0-9]{8}$/.test(routingId)) throw new Error(`Invalid routing ID digest for server ${server.id}`);
    if (used.has(routingId)) throw new Error(`Routing ID collision for server ${server.id}: ${routingId}`);
    used.add(routingId);
    updates.push({ serverId: server.id, routingId });
  }
  return updates;
}

export function planManagedDomainMigration(input: {
  projects: LegacyProject[];
  domains: LegacyDomain[];
  baseDomain?: string;
  generateKey?: () => string;
}): { projectKeys: Map<string, string>; updates: ManagedDomainMigrationUpdate[]; skipped: Array<{ domainId: string; reason: string }> } {
  const baseDomain = (input.baseDomain ?? "vibrail.app").toLowerCase();
  const generateKey = input.generateKey ?? generateProjectRouteKey;
  const projectById = new Map(input.projects.map((row) => [row.id, row]));
  const usedKeys = new Set(input.projects.map((row) => row.routeKey).filter((key): key is string => !!key && key.length === 8));
  for (const key of input.domains.map((row) => row.managedKey)) {
    if (key && /^[a-z0-9]{8}$/.test(key)) usedKeys.add(key);
  }
  const occupiedHosts = new Set(input.domains.map((row) => row.hostname.toLowerCase()));
  const projectKeys = new Map<string, string>();
  const updates: ManagedDomainMigrationUpdate[] = [];
  const skipped: Array<{ domainId: string; reason: string }> = [];

  const allocate = (project: LegacyProject): string => {
    const existing = project.routeKey?.toLowerCase();
    if (existing && /^[a-z0-9]{8}$/.test(existing)) return existing;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const key = generateKey().toLowerCase();
      if (/^[a-z0-9]{8}$/.test(key) && !usedKeys.has(key)) { usedKeys.add(key); return key; }
    }
    throw new Error(`Unable to allocate migration key for project ${project.id}`);
  };

  for (const domain of input.domains) {
    if (domain.domainType !== "free") continue;
    if (!domain.projectId) { skipped.push({ domainId: domain.id, reason: "free domain has no project" }); continue; }
    const project = projectById.get(domain.projectId);
    if (!project) { skipped.push({ domainId: domain.id, reason: "project not found" }); continue; }
    if (domain.managedKey && /^[a-z0-9]{8}$/.test(domain.managedKey) && domain.hostname.toLowerCase().endsWith(`.${baseDomain}`)) continue;

    let key = projectKeys.get(project.id) ?? allocate(project);
    projectKeys.set(project.id, key);
    const oldLabel = domain.hostname.toLowerCase().split(".")[0] ?? "app";
    const legacySuffix = project.routeKey ? new RegExp(`-${project.routeKey.toLowerCase()}$`) : null;
    const baseLabel = managedDomainSlug(legacySuffix ? oldLabel.replace(legacySuffix, "") : oldLabel || project.slug || project.name);
    let hostname = `${appendProjectRouteKey(baseLabel, key)}.${baseDomain}`;
    // A project can own several service domains. If a generated hostname is
    // occupied by another row, rotate the project key and retry all subsequent
    // rows; existing hostname is excluded because this update replaces it.
    if (updates.some((row) => row.projectId === project.id && row.hostname === hostname)) {
      skipped.push({ domainId: domain.id, reason: `normalized hostname collides within project: ${hostname}` });
      continue;
    }
    for (let attempt = 0; occupiedHosts.has(hostname) && hostname !== domain.hostname.toLowerCase(); attempt += 1) {
      if (attempt >= 31) throw new Error(`Unable to avoid hostname collision for ${domain.id}`);
      usedKeys.delete(key);
      key = allocate({ ...project, routeKey: null });
      projectKeys.set(project.id, key);
      hostname = `${appendProjectRouteKey(baseLabel, key)}.${baseDomain}`;
    }
    occupiedHosts.delete(domain.hostname.toLowerCase());
    occupiedHosts.add(hostname);
    updates.push({ domainId: domain.id, projectId: project.id, oldHostname: domain.hostname, hostname, managedKey: key });
  }
  return { projectKeys, updates, skipped };
}
