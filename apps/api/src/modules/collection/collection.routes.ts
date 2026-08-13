import { Hono } from "hono";
import { resolveAppLogo, type AppLogoConfig } from "@repo/core";
import { and, asc, db, desc, eq, inArray, isNotNull, isNull, schema, sql } from "@repo/db";
import { auth } from "../../lib/auth";
import { getRequestContext } from "../../lib/request-context";
import { secureRouter } from "../../lib/secure-router";
import { authMiddleware } from "../../middleware/auth";
import { getTemplateForOrg } from "../apps/catalog-source";

async function visibleProject(projectId: string) {
  const [row] = await db
    .select({ id: schema.project.id })
    .from(schema.project)
    .where(
      and(
        eq(schema.project.id, projectId),
        isNull(schema.project.deletedAt),
        eq(schema.project.active, true),
        eq(schema.project.shareToCollection, true),
        eq(schema.project.moderationStatus, "active"),
        isNotNull(schema.project.activeDeploymentId),
      ),
    )
    .limit(1);
  return row;
}

/** Public collection feed plus authenticated engagement endpoints. */
const r = secureRouter(new Hono(), { module: "collection", basePath: "/api/collection" });

r.public(
  "get",
  "/",
  { reason: "Public gallery of projects whose owners opted into collection visibility" },
  async (c) => {
    const rows = await db
      .select({
        id: schema.project.id,
        organizationId: schema.project.organizationId,
        name: schema.project.name,
        slug: schema.project.slug,
        collectionUrl: schema.project.collectionUrl,
        favicon: schema.project.favicon,
        isApp: schema.project.isApp,
        appTemplateId: schema.project.appTemplateId,
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
          eq(schema.project.shareToCollection, true),
          eq(schema.project.moderationStatus, "active"),
          eq(schema.domain.ownerType, "project"),
          eq(schema.domain.status, "active"),
          isNotNull(schema.project.activeDeploymentId),
        ),
      )
      .orderBy(desc(schema.domain.isPrimary), desc(schema.project.updatedAt));

    const seen = new Set<string>();
    const uniqueRows = rows.filter((row) => !seen.has(row.id) && Boolean(seen.add(row.id)));
    const projectIds = uniqueRows.map((row) => row.id);
    const appLogos = new Map<string, AppLogoConfig>();
    await Promise.all(
      uniqueRows.map(async (row) => {
        if (!row.isApp || !row.appTemplateId) return;
        const template = await getTemplateForOrg(row.organizationId, row.appTemplateId);
        if (template?.logo) {
          appLogos.set(row.id, resolveAppLogo(row.appTemplateId, template.logo));
        }
      }),
    );
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
    const missingOrganizationIds = [
      ...new Set(
        uniqueRows.filter((row) => !creatorByProject.has(row.id)).map((row) => row.organizationId),
      ),
    ];
    const owners = missingOrganizationIds.length
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
              inArray(schema.member.organizationId, missingOrganizationIds),
            ),
          )
          .orderBy(asc(schema.member.createdAt))
      : [];
    const ownerByOrganization = new Map<string, (typeof owners)[number]>();
    for (const owner of owners)
      if (!ownerByOrganization.has(owner.organizationId))
        ownerByOrganization.set(owner.organizationId, owner);

    const likeCounts = projectIds.length
      ? await db
          .select({ projectId: schema.collectionLike.projectId, count: sql<number>`count(*)::int` })
          .from(schema.collectionLike)
          .where(inArray(schema.collectionLike.projectId, projectIds))
          .groupBy(schema.collectionLike.projectId)
      : [];
    const commentCounts = projectIds.length
      ? await db
          .select({
            projectId: schema.collectionComment.projectId,
            count: sql<number>`count(*)::int`,
          })
          .from(schema.collectionComment)
          .where(inArray(schema.collectionComment.projectId, projectIds))
          .groupBy(schema.collectionComment.projectId)
      : [];
    const comments = projectIds.length
      ? await db
          .select({
            id: schema.collectionComment.id,
            projectId: schema.collectionComment.projectId,
            content: schema.collectionComment.content,
            createdAt: schema.collectionComment.createdAt,
            author: { name: schema.user.name, image: schema.user.image },
          })
          .from(schema.collectionComment)
          .innerJoin(schema.user, eq(schema.user.id, schema.collectionComment.userId))
          .where(inArray(schema.collectionComment.projectId, projectIds))
          .orderBy(asc(schema.collectionComment.createdAt))
      : [];
    const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
    const viewerLikes =
      session?.user.id && projectIds.length
        ? await db
            .select({ projectId: schema.collectionLike.projectId })
            .from(schema.collectionLike)
            .where(
              and(
                eq(schema.collectionLike.userId, session.user.id),
                inArray(schema.collectionLike.projectId, projectIds),
              ),
            )
        : [];
    const likedIds = new Set(viewerLikes.map((like) => like.projectId));
    const likesByProject = new Map(likeCounts.map((item) => [item.projectId, item.count]));
    const commentCountByProject = new Map(
      commentCounts.map((item) => [item.projectId, item.count]),
    );
    const commentsByProject = new Map<string, typeof comments>();
    for (const comment of comments)
      commentsByProject.set(comment.projectId, [
        ...(commentsByProject.get(comment.projectId) ?? []),
        comment,
      ]);

    return c.json({
      authenticated: Boolean(session),
      data: uniqueRows.map((row) => {
        const creator =
          creatorsById.get(creatorByProject.get(row.id) ?? "") ??
          ownerByOrganization.get(row.organizationId);
        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          url: row.collectionUrl || `https://${row.hostname}`,
          favicon: row.favicon,
          isApp: row.isApp,
          appTemplateId: row.appTemplateId,
          appLogo: appLogos.get(row.id) ?? null,
          framework: row.framework,
          updatedAt: row.updatedAt,
          publisher: creator ? { name: creator.name, image: creator.image } : null,
          likeCount: likesByProject.get(row.id) ?? 0,
          likedByViewer: likedIds.has(row.id),
          commentCount: commentCountByProject.get(row.id) ?? 0,
          comments: commentsByProject.get(row.id) ?? [],
        };
      }),
    });
  },
);

r.public(
  "post",
  "/:projectId/like",
  {
    reason:
      "Public collection engagement endpoint; a valid user session is enforced inline before mutation",
  },
  authMiddleware,
  async (c) => {
    const projectId = c.req.param("projectId");
    if (!projectId) return c.json({ error: "Project not found" }, 404);
    if (!(await visibleProject(projectId))) return c.json({ error: "Project not found" }, 404);
    const userId = getRequestContext(c).userId;
    const [existing] = await db
      .select({ projectId: schema.collectionLike.projectId })
      .from(schema.collectionLike)
      .where(
        and(
          eq(schema.collectionLike.projectId, projectId),
          eq(schema.collectionLike.userId, userId),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .delete(schema.collectionLike)
        .where(
          and(
            eq(schema.collectionLike.projectId, projectId),
            eq(schema.collectionLike.userId, userId),
          ),
        );
    } else {
      await db.insert(schema.collectionLike).values({ projectId, userId }).onConflictDoNothing();
    }
    const [total] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.collectionLike)
      .where(eq(schema.collectionLike.projectId, projectId));
    return c.json({ liked: !existing, likeCount: total?.count ?? 0 });
  },
);

r.public(
  "post",
  "/:projectId/comments",
  {
    reason:
      "Public collection engagement endpoint; a valid user session is enforced inline before mutation",
  },
  authMiddleware,
  async (c) => {
    const projectId = c.req.param("projectId");
    if (!projectId) return c.json({ error: "Project not found" }, 404);
    if (!(await visibleProject(projectId))) return c.json({ error: "Project not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as { content?: unknown } | null;
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content || content.length > 1000)
      return c.json({ error: "Comment must be between 1 and 1000 characters" }, 400);
    const ctx = getRequestContext(c);
    const [comment] = await db
      .insert(schema.collectionComment)
      .values({ id: crypto.randomUUID(), projectId, userId: ctx.userId, content })
      .returning();
    return c.json(
      { data: { ...comment, projectId, author: { name: ctx.user.name, image: null } } },
      201,
    );
  },
);

export const collectionRoutes = r.hono;
