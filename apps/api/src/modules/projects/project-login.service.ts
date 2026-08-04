import { randomBytes } from "node:crypto";
import { repos } from "@repo/db";
import { ValidationError, isValidEnvKey } from "@repo/core";
import type { RequestContext } from "../../lib/request-context";
import { assertResourceInOrg } from "../../lib/controller-helpers";
import { decrypt, encrypt } from "../../lib/encryption";
import type { TSetProjectLoginBody } from "./project.schema";

export interface ProjectLoginView {
  url: string;
  username: string;
  password: string;
}

function isCatalogApp(project: { isApp?: boolean; appTemplateId?: string | null }): boolean {
  return project.isApp === true || Boolean(project.appTemplateId);
}

function normalizeHttpUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
    return url.toString();
  } catch {
    throw new ValidationError("Project login URL must be a complete http:// or https:// URL.");
  }
}

export async function getProjectLogin(
  ctx: RequestContext,
  projectId: string,
): Promise<ProjectLoginView | null> {
  const project = await repos.project.findById(projectId);
  assertResourceInOrg(project, "Project", ctx.organizationId, projectId);
  if (isCatalogApp(project)) return null;
  const row = await repos.projectLogin.findByProjectId(projectId);
  if (!row?.passwordEncrypted) return null;
  return {
    url: row.url,
    username: row.username,
    password: decrypt(row.passwordEncrypted),
  };
}

export async function setProjectLogin(
  ctx: RequestContext,
  projectId: string,
  input: TSetProjectLoginBody,
): Promise<{ configured: true; generatedPassword: boolean }> {
  const project = await repos.project.findById(projectId);
  assertResourceInOrg(project, "Project", ctx.organizationId, projectId);
  if (isCatalogApp(project)) {
    throw new ValidationError(
      "Project login is only available for non-App Catalog projects. Catalog apps use their template connection outputs.",
    );
  }

  const username = input.username.trim();
  const generatedPassword = input.generatePassword === true;
  if (generatedPassword && input.password) {
    throw new ValidationError("Choose either password or generatePassword, not both.");
  }
  if (!generatedPassword && !input.password) {
    throw new ValidationError("Provide password or set generatePassword=true.");
  }
  const password = generatedPassword
    ? randomBytes(24).toString("base64url")
    : input.password!;

  const usernameEnvKey = input.usernameEnvKey?.trim() || null;
  const passwordEnvKey = input.passwordEnvKey?.trim() || null;
  for (const key of [usernameEnvKey, passwordEnvKey]) {
    if (key && !isValidEnvKey(key)) {
      throw new ValidationError(`Invalid environment variable name: ${key}`);
    }
  }
  if ((usernameEnvKey || passwordEnvKey) && !input.service) {
    throw new ValidationError("service is required when login values are written to environment variables.");
  }

  let serviceId: string | null = null;
  if (input.service) {
    const services = await repos.service.listByProject(projectId);
    const service = services.find((item) => item.id === input.service || item.name === input.service);
    if (!service) throw new ValidationError(`Service not found in this project: ${input.service}`);
    serviceId = service.id;
  }

  const envUpserts: Array<{
    key: string;
    value: string;
    isSecret: boolean;
    serviceId: string;
  }> = [];
  if (serviceId && usernameEnvKey) {
    envUpserts.push({
      key: usernameEnvKey,
      value: encrypt(username),
      isSecret: false,
      serviceId,
    });
  }
  if (serviceId && passwordEnvKey) {
    envUpserts.push({
      key: passwordEnvKey,
      value: encrypt(password),
      isSecret: true,
      serviceId,
    });
  }

  await repos.projectLogin.upsert(
    {
      projectId,
      serviceId,
      url: normalizeHttpUrl(input.url),
      username,
      passwordEncrypted: encrypt(password),
      usernameEnvKey,
      passwordEnvKey,
    },
    envUpserts,
  );
  return { configured: true, generatedPassword };
}

export async function removeProjectLogin(ctx: RequestContext, projectId: string): Promise<void> {
  const project = await repos.project.findById(projectId);
  assertResourceInOrg(project, "Project", ctx.organizationId, projectId);
  await repos.projectLogin.remove(projectId);
}
