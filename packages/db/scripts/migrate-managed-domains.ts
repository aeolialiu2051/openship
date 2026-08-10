import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { closeDb, db } from "../src/client";
import { domain, project, servers } from "../src/schema";
import { planManagedDomainMigration, planServerRoutingIdMigration } from "../src/managed-domain-migration";

async function main() {
  const apply = process.argv.includes("--apply");
  const baseArg = process.argv.indexOf("--base-domain");
  const baseDomain = baseArg >= 0 ? process.argv[baseArg + 1] : "vibrail.app";
  const [projects, domains, serverRows] = await Promise.all([
    db.select({ id: project.id, slug: project.slug, name: project.name, routeKey: project.routeKey }).from(project),
    db.select({ id: domain.id, projectId: domain.projectId, hostname: domain.hostname, domainType: domain.domainType, managedKey: domain.managedKey }).from(domain),
    db.select({ id: servers.id, routingId: servers.routingId }).from(servers),
  ]);
  const plan = planManagedDomainMigration({ projects, domains, baseDomain });
  const serverUpdates = planServerRoutingIdMigration(serverRows, (value) => createHash("md5").update(value).digest("hex"));
  const report = { mode: apply ? "apply" : "dry-run", baseDomain, projects: plan.projectKeys.size, domains: plan.updates.length, servers: serverUpdates.length, updates: plan.updates, serverUpdates, skipped: plan.skipped };
  if (apply) {
    await db.transaction(async (tx) => {
      for (const [projectId, routeKey] of plan.projectKeys) await tx.update(project).set({ routeKey, updatedAt: new Date() }).where(eq(project.id, projectId));
      for (const update of plan.updates) await tx.update(domain).set({ hostname: update.hostname, managedKey: update.managedKey, routeVersion: 1, routeStatus: "pending", updatedAt: new Date() }).where(eq(domain.id, update.domainId));
      for (const update of serverUpdates) await tx.update(servers).set({ routingId: update.routingId, updatedAt: new Date() }).where(eq(servers.id, update.serverId));
    });
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  await closeDb();
}
main().catch(async (error) => { console.error("[managed-domain-migration] failed:", error); await closeDb().catch(() => undefined); process.exit(1); });
