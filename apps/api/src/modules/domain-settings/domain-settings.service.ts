import { isValidCustomHostname, ValidationError } from "@repo/core";
import { repos, type DomainSettings } from "@repo/db";
import type { RequestContext } from "../../lib/request-context";
import { decrypt, encrypt } from "../../lib/encryption";
import { normalizeDnsZoneDomain, verifyCloudflareZone } from "../../lib/cloudflare-dns";

export interface DomainSettingsInput {
  domain: string;
  cloudflareZoneId: string;
  cloudflareApiToken?: string;
  cloudflareProxy?: boolean;
}

function publicView(row: DomainSettings | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    domain: row.domain,
    cloudflareZoneId: row.cloudflareZoneId,
    cloudflareApiTokenConfigured: true,
    cloudflareProxy: row.cloudflareProxy,
    verifiedAt: row.verifiedAt,
    lastVerificationError: row.lastVerificationError,
    updatedAt: row.updatedAt,
  };
}

export async function listDomainSettings(ctx: RequestContext) {
  return (await repos.domainSettings.list(ctx.organizationId)).map((row) => publicView(row)!);
}

async function validatedValues(input: DomainSettingsInput, existing?: DomainSettings) {
  const domain = normalizeDnsZoneDomain(input.domain);
  const zoneId = input.cloudflareZoneId?.trim();
  const suppliedToken = input.cloudflareApiToken?.trim();
  if (!isValidCustomHostname(domain)) {
    throw new ValidationError("Enter a valid Cloudflare zone domain, for example example.com");
  }
  if (!zoneId) throw new ValidationError("Cloudflare Zone ID is required");

  let apiToken = suppliedToken;
  if (!apiToken && existing) {
    try {
      apiToken = decrypt(existing.cloudflareApiTokenEncrypted);
    } catch {
      throw new ValidationError("The saved API token cannot be decrypted; enter it again");
    }
  }
  if (!apiToken) throw new ValidationError("Cloudflare API Token is required");

  await verifyCloudflareZone({ domain, zoneId, apiToken });
  return {
    domain,
    cloudflareZoneId: zoneId,
    cloudflareApiTokenEncrypted: encrypt(apiToken),
    cloudflareProxy: input.cloudflareProxy ?? true,
    verifiedAt: new Date(),
    lastVerificationError: null,
  };
}

export async function createDomainSettings(ctx: RequestContext, input: DomainSettingsInput) {
  const values = await validatedValues(input);
  if (await repos.domainSettings.getByDomain(ctx.organizationId, values.domain)) {
    throw new ValidationError("This Cloudflare domain is already connected");
  }
  const row = await repos.domainSettings.create({
    organizationId: ctx.organizationId,
    ...values,
  });
  return publicView(row);
}

export async function testDomainSettings(
  ctx: RequestContext,
  input: DomainSettingsInput,
  id?: string,
) {
  const existing = id ? await repos.domainSettings.getById(ctx.organizationId, id) : undefined;
  if (id && !existing) throw new ValidationError("Cloudflare domain not found");
  await validatedValues(input, existing);
  return { ok: true as const };
}

export async function updateDomainSettings(
  ctx: RequestContext,
  id: string,
  input: DomainSettingsInput,
) {
  const existing = await repos.domainSettings.getById(ctx.organizationId, id);
  if (!existing) throw new ValidationError("Cloudflare domain not found");
  const values = await validatedValues(input, existing);
  const duplicate = await repos.domainSettings.getByDomain(ctx.organizationId, values.domain);
  if (duplicate && duplicate.id !== id) {
    throw new ValidationError("This Cloudflare domain is already connected");
  }
  const row = await repos.domainSettings.update(ctx.organizationId, id, values);
  return publicView(row);
}

export async function verifyDomainSettings(ctx: RequestContext, id: string) {
  const existing = await repos.domainSettings.getById(ctx.organizationId, id);
  if (!existing) throw new ValidationError("Cloudflare domain not found");
  try {
    const apiToken = decrypt(existing.cloudflareApiTokenEncrypted);
    await verifyCloudflareZone({
      domain: existing.domain,
      zoneId: existing.cloudflareZoneId,
      apiToken,
    });
    const verifiedAt = new Date();
    await repos.domainSettings.updateVerification(ctx.organizationId, id, {
      verifiedAt,
      lastVerificationError: null,
    });
    return { ok: true, verifiedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cloudflare verification failed";
    await repos.domainSettings.updateVerification(ctx.organizationId, id, {
      verifiedAt: null,
      lastVerificationError: message,
    });
    throw new ValidationError(message);
  }
}

export async function removeDomainSettings(ctx: RequestContext, id: string) {
  await repos.domainSettings.remove(ctx.organizationId, id);
}
