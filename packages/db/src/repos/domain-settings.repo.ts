import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { domainSettings } from "../schema";

export type DomainSettings = typeof domainSettings.$inferSelect;
export type NewDomainSettings = typeof domainSettings.$inferInsert;

/** Secrets are already encrypted by the API layer before they reach this repo. */
export function createDomainSettingsRepo(db: Database) {
  return {
    async get(organizationId: string): Promise<DomainSettings | undefined> {
      return db.query.domainSettings.findFirst({
        where: eq(domainSettings.organizationId, organizationId),
      });
    },

    async upsert(data: NewDomainSettings): Promise<DomainSettings> {
      const [row] = await db
        .insert(domainSettings)
        .values(data)
        .onConflictDoUpdate({
          target: domainSettings.organizationId,
          set: {
            domain: data.domain,
            cloudflareZoneId: data.cloudflareZoneId,
            cloudflareApiTokenEncrypted: data.cloudflareApiTokenEncrypted,
            cloudflareProxy: data.cloudflareProxy ?? true,
            verifiedAt: data.verifiedAt ?? null,
            lastVerificationError: data.lastVerificationError ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row;
    },

    async updateVerification(
      organizationId: string,
      result: { verifiedAt: Date | null; lastVerificationError: string | null },
    ): Promise<void> {
      await db
        .update(domainSettings)
        .set({ ...result, updatedAt: new Date() })
        .where(eq(domainSettings.organizationId, organizationId));
    },

    async remove(organizationId: string): Promise<void> {
      await db.delete(domainSettings).where(eq(domainSettings.organizationId, organizationId));
    },
  };
}
