import brand from "./locales/en/brand.json";
import auth from "./locales/en/auth.json";
import dashboard from "./locales/en/dashboard.json";
import settings from "./locales/en/settings.json";
import servers from "./locales/en/servers.json";
import billing from "./locales/en/billing.json";
import library from "./locales/en/library.json";
import onboarding from "./locales/en/onboarding.json";
import deploy from "./locales/en/deploy.json";
import deployments from "./locales/en/deployments.json";
import importProject from "./locales/en/importProject.json";
import projects from "./locales/en/projects.json";
import projectSettings from "./locales/en/projectSettings.json";
import projectDetail from "./locales/en/projectDetail.json";
import emails from "./locales/en/emails.json";
import emailsAdmin from "./locales/en/emailsAdmin.json";
import chrome from "./locales/en/chrome.json";
import overview from "./locales/en/overview.json";
import widgets from "./locales/en/widgets.json";
import misc from "./locales/en/misc.json";
import migration from "./locales/en/migration.json";
import jobs from "./locales/en/jobs.json";
import domainsPage from "./locales/en/domainsPage.json";
import { defaultLocale, type Locale } from "./config";
import type { Dictionary } from "./types";

/** English is server-rendered initially and only lazy-loaded in the browser
 * when a user switches locale at runtime. */
export const baseDictionary: Dictionary = {
  brand,
  auth,
  dashboard,
  settings,
  servers,
  billing,
  library,
  onboarding,
  deploy,
  deployments,
  importProject,
  projects,
  projectSettings,
  projectDetail,
  emails,
  emailsAdmin,
  chrome,
  overview,
  widgets,
  misc,
  migration,
  jobs,
  domainsPage,
};

const NAMESPACES = Object.keys(baseDictionary) as (keyof Dictionary)[];

function deepMerge<T>(base: T, src: unknown): T {
  if (src == null || typeof src !== "object" || Array.isArray(src)) {
    return (src ?? base) as T;
  }
  if (typeof base !== "object" || base == null || Array.isArray(base)) {
    return (src as T) ?? base;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(src as Record<string, unknown>)) {
    out[key] = deepMerge((base as Record<string, unknown>)[key], value);
  }
  return out as T;
}

/** Load one locale, filling missing translated keys from English. */
export async function loadDictionary(locale: Locale): Promise<Dictionary> {
  if (locale === defaultLocale) return baseDictionary;

  const parts = await Promise.all(
    NAMESPACES.map(async (namespace) => {
      try {
        const module = await import(`./locales/${locale}/${namespace}.json`);
        return [namespace, (module as { default: unknown }).default] as const;
      } catch {
        return [namespace, undefined] as const;
      }
    }),
  );
  const loaded = Object.fromEntries(parts.filter(([, value]) => value !== undefined));
  return deepMerge(baseDictionary, loaded);
}
