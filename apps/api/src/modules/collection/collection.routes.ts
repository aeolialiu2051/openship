import { Hono } from "hono";
import { and, db, desc, eq, isNotNull, isNull, schema } from "@repo/db";

/** Public, read-only feed of running projects that opted into a public route. */
export const collectionRoutes = new Hono().get("/", async (c) => {
  const rows = await db
    .select({
      id: schema.project.id,
      name: schema.project.name,
      slug: schema.project.slug,
      favicon: schema.project.favicon,
      framework: schema.deployment.framework,
      updatedAt: schema.project.updatedAt,
      hostname: schema.domain.hostname,
    })
    .from(schema.project)
    .innerJoin(schema.domain, eq(schema.domain.projectId, schema.project.id))
    .innerJoin(schema.deployment, eq(schema.deployment.id, schema.project.activeDeploymentId))
    .where(
      and(
        isNull(schema.project.deletedAt),
        eq(schema.project.active, true),
        eq(schema.project.moderationStatus, "active"),
        eq(schema.domain.ownerType, "project"),
        eq(schema.domain.status, "active"),
        isNotNull(schema.project.activeDeploymentId),
      ),
    )
    .orderBy(desc(schema.domain.isPrimary), desc(schema.project.updatedAt));

  const seen = new Set<string>();
  const projects = rows.flatMap((row) => {
    if (seen.has(row.id)) return [];
    seen.add(row.id);
    return [{
      id: row.id,
      name: row.name,
      slug: row.slug,
      url: `https://${row.hostname}`,
      favicon: row.favicon,
      framework: row.framework,
      updatedAt: row.updatedAt,
    }];
  });

  return c.json({ data: projects });
});
