import type { Context, Next } from "hono";
import { USER_SERVERS_ENABLED } from "../config/env";

/** Restrict a route to runtimes that may manage user-owned SSH servers. */
export async function userServersOnly(c: Context, next: Next) {
  if (!USER_SERVERS_ENABLED) return c.notFound();
  await next();
}
