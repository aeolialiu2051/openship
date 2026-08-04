import { and, eq } from "drizzle-orm";
import { generateId } from "@repo/core";
import type { Database } from "../client";
import { envVar, projectLogin } from "../schema";

export type ProjectLogin = typeof projectLogin.$inferSelect;

export function createProjectLoginRepo(db: Database) {
  return {
    async findByProjectId(projectId: string): Promise<ProjectLogin | undefined> {
      return db.query.projectLogin.findFirst({ where: eq(projectLogin.projectId, projectId) });
    },

    /** Persist the card and its optional service env updates atomically. */
    async upsert(
      row: Omit<ProjectLogin, "createdAt" | "updatedAt">,
      envUpserts: Array<{
        key: string;
        value: string;
        isSecret: boolean;
        serviceId: string;
      }>,
    ): Promise<void> {
      await db.transaction(async (tx) => {
        for (const value of envUpserts) {
          await tx
            .delete(envVar)
            .where(
              and(
                eq(envVar.projectId, row.projectId),
                eq(envVar.environment, "production"),
                eq(envVar.serviceId, value.serviceId),
                eq(envVar.key, value.key),
              ),
            );
          await tx.insert(envVar).values({
            id: generateId("env"),
            projectId: row.projectId,
            serviceId: value.serviceId,
            environment: "production",
            key: value.key,
            value: value.value,
            isSecret: value.isSecret,
          });
        }

        await tx
          .insert(projectLogin)
          .values(row)
          .onConflictDoUpdate({
            target: projectLogin.projectId,
            set: {
              serviceId: row.serviceId,
              url: row.url,
              username: row.username,
              passwordEncrypted: row.passwordEncrypted,
              usernameEnvKey: row.usernameEnvKey,
              passwordEnvKey: row.passwordEnvKey,
              updatedAt: new Date(),
            },
          });
      });
    },

    async remove(projectId: string): Promise<void> {
      await db.delete(projectLogin).where(eq(projectLogin.projectId, projectId));
    },
  };
}
