import { api } from "./client";
import { endpoints } from "./endpoints";

export interface DomainSettingsView {
  domain: string;
  cloudflareZoneId: string;
  cloudflareApiTokenConfigured: boolean;
  cloudflareProxy: boolean;
  verifiedAt: string | null;
  lastVerificationError: string | null;
  updatedAt: string;
}

export interface SaveDomainSettingsInput {
  domain: string;
  cloudflareZoneId: string;
  cloudflareApiToken?: string;
  cloudflareProxy: boolean;
}

export const domainSettingsApi = {
  async get(): Promise<DomainSettingsView | null> {
    const response = await api.get<{ data: DomainSettingsView | null }>(
      endpoints.domainSettings.get,
    );
    return response.data;
  },

  async save(input: SaveDomainSettingsInput): Promise<DomainSettingsView> {
    const response = await api.put<{ data: DomainSettingsView }>(
      endpoints.domainSettings.get,
      input,
    );
    return response.data;
  },

  async verify(): Promise<{ ok: true; verifiedAt: string }> {
    const response = await api.post<{ data: { ok: true; verifiedAt: string } }>(
      endpoints.domainSettings.verify,
    );
    return response.data;
  },

  async remove(): Promise<void> {
    await api.delete(endpoints.domainSettings.get);
  },
};
