import type { Context } from "hono";
import { safeErrorMessage } from "@repo/core";
import { getRequestContext } from "../../../lib/request-context";
import { isServerInOrg } from "../../../lib/controller-helpers";
import { permission } from "../../../lib/permission";
import { projectInfoToScanResponse } from "../../deployments/prepare.service";
import { createFolderSession, acceptRelayUpload, scanFolderSession } from "./folder.service";
import { getFolderSession } from "./session-store";

/**
 * POST /projects/folder/session
 * Open a folder-upload session. User-server uploads always use the API relay;
 * cloud-workspace callers may receive a direct workspace upload target.
 */
export async function createSession(c: Context) {
  const ctx = getRequestContext(c);
  const body = await c.req
    .json<{ stack?: string; packageManager?: string; name?: string; serverId?: string }>()
    .catch(() => ({}) as { stack?: string; packageManager?: string; name?: string; serverId?: string });

  if (body.serverId) {
    await permission.assert(ctx, {
      resourceType: "server",
      resourceId: body.serverId,
      action: "write",
    });
    if (!(await isServerInOrg(ctx, body.serverId))) {
      return c.json({ error: "Server not found" }, 404);
    }
  }

  try {
    const result = await createFolderSession({
      orgId: ctx.organizationId,
      userId: ctx.userId,
      stack: body.stack,
      packageManager: body.packageManager,
      name: body.name,
      serverId: body.serverId,
    });
    return c.json({ success: true, ...result });
  } catch (err) {
    return c.json({ error: safeErrorMessage(err) }, 502);
  }
}

/**
 * POST /projects/folder/upload/:sessionId
 * Accepts only sessions created with the api-relay transport.
 * Streamed tar.gz body → staging dir. Ticket-authorized. Binary body, so this
 * route is excluded from MCP tool generation (see mcp-tools DENY list).
 */
export async function uploadRelay(c: Context) {
  const { organizationId } = getRequestContext(c);
  const sessionId = c.req.param("sessionId");
  const session = sessionId ? getFolderSession(sessionId) : undefined;
  if (!session || session.orgId !== organizationId) {
    return c.json({ error: "Upload session not found" }, 404);
  }
  if (session.mode !== "api-relay") {
    return c.json({ error: "Session does not accept relay uploads" }, 400);
  }

  const ticket = c.req.header("x-upload-ticket") ?? c.req.query("ticket");
  if (!ticket || ticket !== session.uploadTicket) {
    return c.json({ error: "Invalid upload ticket" }, 403);
  }

  const body = c.req.raw.body;
  if (!body) return c.json({ error: "Empty upload" }, 400);

  try {
    await acceptRelayUpload(session, body);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: safeErrorMessage(err) }, 500);
  }
}

/**
 * POST /projects/folder/scan/:sessionId
 * Authoritative framework detection on the uploaded source. Same response
 * shape as scanLocal so the deploy wizard consumes it unchanged.
 */
export async function scanSession(c: Context) {
  const { organizationId } = getRequestContext(c);
  const sessionId = c.req.param("sessionId");
  const session = sessionId ? getFolderSession(sessionId) : undefined;
  if (!session || session.orgId !== organizationId) {
    return c.json({ error: "Upload session not found" }, 404);
  }

  try {
    const result = await scanFolderSession(session);
    // Preserve the scan's Compose shape inside the upload session. MCP/API
    // callers should not have to echo a potentially large services array back
    // into build/access for the backend to honor Compose-first deployment.
    session.detectedServices = result.services;
    return c.json({ success: true, sessionId, ...projectInfoToScanResponse(result) });
  } catch (err) {
    return c.json({ error: safeErrorMessage(err) }, 500);
  }
}
