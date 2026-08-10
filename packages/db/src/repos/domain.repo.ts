import { eq, and, lt, inArray, isNull, or, sql, asc } from "drizzle-orm";
import { generateId, generateManagedDomain } from "@repo/core";
import type { Database } from "../client";
import { domain, project } from "../schema";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Domain = typeof domain.$inferSelect;
export type NewDomain = typeof domain.$inferInsert;

// ─── Repository ──────────────────────────────────────────────────────────────

export function createDomainRepo(db: Database) {
  return {
    async findById(id: string) {
      return db.query.domain.findFirst({
        where: eq(domain.id, id),
      });
    },

    async findByHostname(hostname: string) {
      return db.query.domain.findFirst({
        where: eq(domain.hostname, hostname.toLowerCase()),
      });
    },

    /**
     * Return every domain row for a project.
     *
     * Most callers (routing-domain resolution, build pipeline, project
     * teardown) genuinely need every domain — they iterate every row
     * to install certs, register routes, or clean up state. Pagination
     * would break those flows.
     *
     * For dashboard reads that only need a bounded preview, pass
     * `limit`/`offset` and a deterministic order. The default (no
     * args) keeps the every-row contract for the internal callers.
     */
    async listByProject(projectId: string, opts?: { limit?: number; offset?: number }) {
      return db.query.domain.findMany({
        where: eq(domain.projectId, projectId),
        ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
        ...(opts?.offset !== undefined ? { offset: opts.offset } : {}),
      });
    },

    /**
     * Projects in an organization that currently own at least one custom
     * project/service domain row. Legacy rows with a null domainType predate
     * the explicit free/custom discriminator and are custom-domain rows.
     */
    async listCustomDomainProjectsByOrganization(organizationId: string) {
      return db
        .selectDistinct({
          projectId: project.id,
          projectName: project.name,
        })
        .from(domain)
        .innerJoin(project, eq(domain.projectId, project.id))
        .where(
          and(
            eq(project.organizationId, organizationId),
            isNull(project.deletedAt),
            eq(domain.ownerType, "project"),
            or(eq(domain.domainType, "custom"), isNull(domain.domainType)),
          ),
        );
    },

    /**
     * Single-row lookup for `(projectId, hostname)`. Use this instead
     * of `listByProject(...).find(d => d.hostname === h)` — controllers
     * that match a single hostname don't need to fan-out a full list.
     */
    async findByHostnameForProject(projectId: string, hostname: string) {
      return db.query.domain.findFirst({
        where: and(eq(domain.projectId, projectId), eq(domain.hostname, hostname.toLowerCase())),
      });
    },

    async listByIds(ids: string[]) {
      if (ids.length === 0) return [];

      const rows = await db.query.domain.findMany({
        where: inArray(domain.id, ids),
      });
      const order = new Map(ids.map((id, index) => [id, index]));
      return rows.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
    },

    async update(id: string, data: Partial<NewDomain>) {
      await db
        .update(domain)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(domain.id, id));
    },

    /** Return the primary domain for a project (or first domain, or null). */
    async getPrimaryByProject(projectId: string): Promise<Domain | null> {
      const rows = await db.query.domain.findMany({
        where: eq(domain.projectId, projectId),
      });
      return rows.find((d) => d.isPrimary) ?? rows[0] ?? null;
    },

    /**
     * Batch variant of getPrimaryByProject — one SQL round trip for N
     * projects. Used by getHome to eliminate the N+1.
     */
    async getPrimariesByProjects(projectIds: string[]): Promise<Map<string, Domain>> {
      if (projectIds.length === 0) return new Map();
      const rows = await db.query.domain.findMany({
        where: inArray(domain.projectId, projectIds),
      });
      // Prefer isPrimary=true; fall back to first row encountered per project.
      const out = new Map<string, Domain>();
      for (const row of rows) {
        if (!row.projectId) continue; // webhook-owned domains have no project
        const existing = out.get(row.projectId);
        if (!existing || (row.isPrimary && !existing.isPrimary)) {
          out.set(row.projectId, row);
        }
      }
      return out;
    },

    async create(data: Omit<NewDomain, "id"> & { verificationToken?: string }) {
      const id = generateId("dom");
      const row = {
        id,
        ...data,
        hostname: data.hostname.toLowerCase(),
        verificationToken: data.verificationToken ?? id,
      };
      await db.insert(domain).values(row);
      return { ...row, createdAt: new Date(), updatedAt: new Date() } as Domain;
    },

    /** Allocate a stable managed hostname. Unique collisions are retried and the
     * resulting key is persisted, so project renames/redeploys never change it. */
    async createManaged(input: {
      projectId: string;
      serviceId?: string | null;
      name: string;
      baseDomain?: string;
      targetPort?: number | null;
      targetPath?: string | null;
      isPrimary?: boolean;
    }): Promise<Domain> {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const managed = generateManagedDomain(input.name, { baseDomain: input.baseDomain });
        try {
          return await this.create({
            projectId: input.projectId,
            serviceId: input.serviceId,
            hostname: managed.hostname,
            managedKey: managed.key,
            domainType: "free",
            targetPort: input.targetPort,
            targetPath: input.targetPath,
            isPrimary: input.isPrimary ?? false,
            verified: true,
            verifiedAt: new Date(),
            status: "active",
            routeStatus: "pending",
            routeVersion: 1,
          });
        } catch (error: any) {
          if (error?.code !== "23505" && !String(error?.message).toLowerCase().includes("unique")) throw error;
        }
      }
      throw new Error("Unable to allocate a unique managed domain after 8 attempts");
    },

    /** Move an edge route state forward. A stale writer can never lower version. */
    async updateRouteState(id: string, version: number, routeStatus: string): Promise<boolean> {
      const rows = await db
        .update(domain)
        .set({ routeVersion: version, routeStatus, updatedAt: new Date() })
        .where(and(eq(domain.id, id), sql`${domain.routeVersion} <= ${version}`))
        .returning();
      return rows.length === 1;
    },

    async nextRouteVersion(id: string): Promise<number> {
      const [row] = await db
        .update(domain)
        .set({ routeVersion: sql`${domain.routeVersion} + 1`, routeStatus: "pending", updatedAt: new Date() })
        .where(eq(domain.id, id))
        .returning();
      if (!row) throw new Error(`Domain ${id} not found`);
      return row.routeVersion;
    },

    async listManagedForReconcile(limit = 100, offset = 0): Promise<Domain[]> {
      return db.query.domain.findMany({
        where: and(eq(domain.ownerType, "project"), eq(domain.domainType, "free")),
        orderBy: [asc(domain.id)],
        limit: Math.min(Math.max(limit, 1), 500),
        offset: Math.max(offset, 0),
      });
    },

    async markRouteReconciled(id: string, at = new Date()): Promise<void> {
      await db.update(domain).set({ routeReconciledAt: at, updatedAt: new Date() }).where(eq(domain.id, id));
    },

    /**
     * Return an existing domain by hostname, or create it if missing.
     * Safe against unique-constraint races (concurrent deploys).
     */
    async findOrCreate(data: Omit<NewDomain, "id"> & { verificationToken?: string }) {
      const hostname = data.hostname.toLowerCase();
      const existing = await db.query.domain.findFirst({
        where: eq(domain.hostname, hostname),
      });
      if (existing) {
        // Promote to primary if caller wants it and it isn't already
        if (data.isPrimary && !existing.isPrimary) {
          await db
            .update(domain)
            .set({ isPrimary: true, updatedAt: new Date() })
            .where(eq(domain.id, existing.id));
          return { ...existing, isPrimary: true };
        }
        return existing;
      }

      const id = generateId("dom");
      const row = {
        id,
        ...data,
        hostname,
        verificationToken: data.verificationToken ?? id,
      };
      try {
        await db.insert(domain).values(row);
        return { ...row, createdAt: new Date(), updatedAt: new Date() } as Domain;
      } catch (err: any) {
        // Handle race: another deploy inserted between our check and insert
        if (err?.message?.includes("unique") || err?.code === "23505") {
          const raced = await db.query.domain.findFirst({
            where: eq(domain.hostname, hostname),
          });
          if (raced) return raced;
        }
        throw err;
      }
    },

    async markVerified(id: string) {
      await db
        .update(domain)
        .set({
          verified: true,
          verifiedAt: new Date(),
          status: "active",
          // Reset the verify state machine on success.
          verifyAttempts: 0,
          lastVerifyError: null,
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(domain.id, id));
    },

    /**
     * Record a failed verification attempt: bump the counter, stamp the time +
     * reason, and flip status to `failed` only once attempts cross `failAfter`
     * (so a still-propagating domain stays `pending`, a misconfigured one
     * eventually reads `failed`). Returns the new attempt count.
     */
    async recordVerifyFailure(id: string, error: string, failAfter = 8): Promise<number> {
      const row = await db.query.domain.findFirst({ where: eq(domain.id, id) });
      const attempts = (row?.verifyAttempts ?? 0) + 1;
      await db
        .update(domain)
        .set({
          verifyAttempts: attempts,
          lastVerifyError: error,
          lastCheckedAt: new Date(),
          ...(attempts >= failAfter ? { status: "failed" } : {}),
          updatedAt: new Date(),
        })
        .where(eq(domain.id, id));
      return attempts;
    },

    async updateSsl(
      id: string,
      data: { sslStatus: string; sslIssuer?: string; sslExpiresAt?: Date },
    ) {
      await this.update(id, data);
    },

    async updateStatus(id: string, status: string) {
      await this.update(id, { status });
    },

    async markDnsManaged(id: string, provider: string, recordId: string) {
      await this.update(id, {
        dnsManaged: true,
        dnsProvider: provider,
        dnsRecordId: recordId,
      });
    },

    async clearDnsManaged(id: string) {
      await this.update(id, {
        dnsManaged: false,
        dnsProvider: null,
        dnsRecordId: null,
      });
    },

    async remove(id: string) {
      await db.delete(domain).where(eq(domain.id, id));
    },

    /** Hard-delete every domain row tied to a project. Frees managed slugs immediately on project teardown. */
    async deleteByProjectId(projectId: string) {
      await db.delete(domain).where(eq(domain.projectId, projectId));
    },

    /** Hard-delete every domain row tied to a service. Clears derived routing rows on service teardown. */
    async deleteByServiceId(serviceId: string) {
      await db.delete(domain).where(eq(domain.serviceId, serviceId));
    },

    /** Find all domains needing SSL renewal */
    async findExpiringSsl(beforeDate: Date) {
      return db.query.domain.findMany({
        where: and(eq(domain.sslStatus, "active"), lt(domain.sslExpiresAt, beforeDate)),
      });
    },

    /**
     * Find custom domains stuck in pending state (verified=false +
     * status=pending) created before `beforeDate`. Used by the pending-
     * verifier cron to re-check DNS for rows whose user added the domain
     * but never clicked Verify (or whose DNS hasn't propagated yet).
     *
     * `beforeDate` is the "added at least N minutes ago" cutoff — we
     * skip just-added rows so the cron doesn't race with the UI's
     * immediate Verify click. Free-managed rows are excluded; they
     * don't go through DNS verification (we own the suffix).
     */
    async findPendingVerification(
      beforeDate: Date,
      limit = 100,
      organizationId?: string,
    ): Promise<Domain[]> {
      const conds = [
        eq(domain.verified, false),
        eq(domain.status, "pending"),
        eq(domain.domainType, "custom"),
        lt(domain.createdAt, beforeDate),
      ];
      // Org scope (HTTP /verify-pending): only this org's pending domains, so a
      // tenant can neither enumerate nor trigger verification/SSL on another
      // tenant's domains, and the row cap applies to their OWN backlog. `domain`
      // has no organizationId column, so filter via its project. Omitted →
      // instance-wide (the system `domains:verify-pending` cron only).
      if (organizationId) {
        conds.push(
          inArray(
            domain.projectId,
            db
              .select({ id: project.id })
              .from(project)
              .where(eq(project.organizationId, organizationId)),
          ),
        );
      }
      const rows = await db.query.domain.findMany({ where: and(...conds) });
      return rows.slice(0, limit);
    },

    /** Set primary domain for a project (unsets previous primary) */
    async setPrimary(projectId: string, domainId: string) {
      // Unset current primary
      await db
        .update(domain)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(and(eq(domain.projectId, projectId), eq(domain.isPrimary, true)));
      // Set new primary
      await db
        .update(domain)
        .set({ isPrimary: true, updatedAt: new Date() })
        .where(eq(domain.id, domainId));
    },
  };
}
