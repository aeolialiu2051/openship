import { isValidCustomHostname, ValidationError } from "@repo/core";
import { repos } from "@repo/db";
import type { RequestContext } from "../../lib/request-context";
import { decrypt, encrypt } from "../../lib/encryption";
import { normalizeDnsZoneDomain, verifyCloudflareZone } from "../../lib/cloudflare-dns";

export interface DomainSettingsInput {
  domain: string;
  cloudflareZoneId: string;
  cloudflareApiToken?: string;
  cloudflareProxy?: boolean;
}

function publicView(row: Awaited<ReturnType<typeof repos.domainSettings.get>>) {
  if (!row) return null;
  return {
    domain: row.domain,
    cloudflareZoneId: row.cloudflareZoneId,
    cloudflareApiTokenConfigured: true,
    cloudflareProxy: row.cloudflareProxy,
    verifiedAt: row.verifiedAt,
    lastVerificationError: row.lastVerificationError,
    updatedAt: row.updatedAt,
  };
}

export async function getDomainSettings(ctx: RequestContext) {
  return publicView(await repos.domainSettings.get(ctx.organizationId));
}

export async function saveDomainSettings(ctx: RequestContext, input: DomainSettingsInput) {
  const existing = await repos.domainSettings.get(ctx.organizationId);
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
  const row = await repos.domainSettings.upsert({
    organizationId: ctx.organizationId,
    domain,
    cloudflareZoneId: zoneId,
    cloudflareApiTokenEncrypted: encrypt(apiToken),
    cloudflareProxy: input.cloudflareProxy ?? true,
    verifiedAt: new Date(),
    lastVerificationError: null,
  });
  return publicView(row);
}

export async function verifyDomainSettings(ctx: RequestContext) {
  const existing = await repos.domainSettings.get(ctx.organizationId);
  if (!existing) throw new ValidationError("Connect a Cloudflare domain first");
  try {
    const apiToken = decrypt(existing.cloudflareApiTokenEncrypted);
    await verifyCloudflareZone({
      domain: existing.domain,
      zoneId: existing.cloudflareZoneId,
      apiToken,
    });
    const verifiedAt = new Date();
    await repos.domainSettings.updateVerification(ctx.organizationId, {
      verifiedAt,
      lastVerificationError: null,
    });
    return { ok: true, verifiedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cloudflare verification failed";
    await repos.domainSettings.updateVerification(ctx.organizationId, {
      verifiedAt: null,
      lastVerificationError: message,
    });
    throw new ValidationError(message);
  }
}

export async function removeDomainSettings(ctx: RequestContext) {
  await repos.domainSettings.remove(ctx.organizationId);
}
