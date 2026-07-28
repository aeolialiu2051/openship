import { api } from "./client";
import { endpoints } from "./endpoints";

export interface DomainSettingsView {
  id: string;
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

export type TestDomainSettingsInput = SaveDomainSettingsInput & { id?: string };

export const domainSettingsApi = {
  async list(): Promise<DomainSettingsView[]> {
    const response = await api.get<{ data: DomainSettingsView[] }>(endpoints.domainSettings.list);
    return response.data;
  },

  async create(input: SaveDomainSettingsInput): Promise<DomainSettingsView> {
    const response = await api.post<{ data: DomainSettingsView }>(
      endpoints.domainSettings.list,
      input,
    );
    return response.data;
  },

  async update(id: string, input: SaveDomainSettingsInput): Promise<DomainSettingsView> {
    const response = await api.put<{ data: DomainSettingsView }>(
      endpoints.domainSettings.byId(id),
      input,
    );
    return response.data;
  },

  async test(input: TestDomainSettingsInput): Promise<{ ok: true }> {
    const response = await api.post<{ data: { ok: true } }>(endpoints.domainSettings.test, input);
    return response.data;
  },

  async verify(id: string): Promise<{ ok: true; verifiedAt: string }> {
    const response = await api.post<{ data: { ok: true; verifiedAt: string } }>(
      endpoints.domainSettings.verify(id),
    );
    return response.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(endpoints.domainSettings.byId(id));
  },
};
