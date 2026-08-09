import { Hono } from "hono";
import { and, asc, db, desc, eq, inArray, isNotNull, isNull, schema } from "@repo/db";

/** Public, read-only feed of running projects that opted into a public route. */
export const collectionRoutes = new Hono().get("/", async (c) => {
  const rows = await db
    .select({
      id: schema.project.id,
      organizationId: schema.project.organizationId,
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
  const uniqueRows = rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });

  const projectIds = uniqueRows.map((row) => row.id);
  const creatorEvents = projectIds.length
    ? await db
        .select({
          projectId: schema.auditEvent.resourceId,
          userId: schema.auditEvent.actorUserId,
        })
        .from(schema.auditEvent)
        .where(
          and(
            eq(schema.auditEvent.eventType, "project.created"),
            eq(schema.auditEvent.resourceType, "project"),
            inArray(schema.auditEvent.resourceId, projectIds),
          ),
        )
        .orderBy(asc(schema.auditEvent.createdAt))
    : [];

  const creatorByProject = new Map<string, string>();
  for (const event of creatorEvents) {
    if (event.projectId && event.userId && !creatorByProject.has(event.projectId)) {
      creatorByProject.set(event.projectId, event.userId);
    }
  }

  const creatorIds = [...new Set(creatorByProject.values())];
  const creators = creatorIds.length
    ? await db
        .select({ id: schema.user.id, name: schema.user.name, image: schema.user.image })
        .from(schema.user)
        .where(inArray(schema.user.id, creatorIds))
    : [];
  const creatorsById = new Map(creators.map((creator) => [creator.id, creator]));

  // Older/imported projects can predate project.created audit events, and audit
  // retention can remove those events. Use the workspace owner as the public
  // publisher fallback instead of showing an anonymous label forever.
  const organizationIdsMissingCreator = [
    ...new Set(
      uniqueRows
        .filter((row) => !creatorByProject.has(row.id))
        .map((row) => row.organizationId),
    ),
  ];
  const owners = organizationIdsMissingCreator.length
    ? await db
        .select({
          organizationId: schema.member.organizationId,
          id: schema.user.id,
          name: schema.user.name,
          image: schema.user.image,
        })
        .from(schema.member)
        .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
        .where(
          and(
            eq(schema.member.role, "owner"),
            inArray(schema.member.organizationId, organizationIdsMissingCreator),
          ),
        )
        .orderBy(asc(schema.member.createdAt))
    : [];
  const ownerByOrganization = new Map<string, (typeof owners)[number]>();
  for (const owner of owners) {
    if (!ownerByOrganization.has(owner.organizationId)) {
      ownerByOrganization.set(owner.organizationId, owner);
    }
  }

  const projects = uniqueRows.map((row) => {
    const creator =
      creatorsById.get(creatorByProject.get(row.id) ?? "") ??
      ownerByOrganization.get(row.organizationId);
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      url: `https://${row.hostname}`,
      favicon: row.favicon,
      framework: row.framework,
      updatedAt: row.updatedAt,
      publisher: creator ? { name: creator.name, image: creator.image } : null,
    };
  });

  return c.json({ data: projects });
});
