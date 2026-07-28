import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { domainSettings } from "../schema";

export type DomainSettings = typeof domainSettings.$inferSelect;
export type NewDomainSettings = typeof domainSettings.$inferInsert;

/** Secrets are already encrypted by the API layer before they reach this repo. */
export function createDomainSettingsRepo(db: Database) {
  return {
    async list(organizationId: string): Promise<DomainSettings[]> {
      return db.query.domainSettings.findMany({
        where: eq(domainSettings.organizationId, organizationId),
        orderBy: [desc(domainSettings.createdAt)],
      });
    },

    async getById(organizationId: string, id: string): Promise<DomainSettings | undefined> {
      return db.query.domainSettings.findFirst({
        where: and(eq(domainSettings.organizationId, organizationId), eq(domainSettings.id, id)),
      });
    },

    async getByDomain(organizationId: string, domain: string): Promise<DomainSettings | undefined> {
      return db.query.domainSettings.findFirst({
        where: and(
          eq(domainSettings.organizationId, organizationId),
          eq(domainSettings.domain, domain),
        ),
      });
    },

    async create(data: NewDomainSettings): Promise<DomainSettings> {
      const [row] = await db.insert(domainSettings).values(data).returning();
      return row;
    },

    async update(
      organizationId: string,
      id: string,
      data: Pick<
        NewDomainSettings,
        | "domain"
        | "cloudflareZoneId"
        | "cloudflareApiTokenEncrypted"
        | "cloudflareProxy"
        | "verifiedAt"
        | "lastVerificationError"
      >,
    ): Promise<DomainSettings | undefined> {
      const [row] = await db
        .update(domainSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(domainSettings.organizationId, organizationId), eq(domainSettings.id, id)))
        .returning();
      return row;
    },

    async updateVerification(
      organizationId: string,
      id: string,
      result: { verifiedAt: Date | null; lastVerificationError: string | null },
    ): Promise<void> {
      await db
        .update(domainSettings)
        .set({ ...result, updatedAt: new Date() })
        .where(and(eq(domainSettings.organizationId, organizationId), eq(domainSettings.id, id)));
    },

    async remove(organizationId: string, id: string): Promise<void> {
      await db
        .delete(domainSettings)
        .where(and(eq(domainSettings.organizationId, organizationId), eq(domainSettings.id, id)));
    },
  };
}
