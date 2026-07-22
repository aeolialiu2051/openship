/**
 * Product quick-tips shown on the dashboard home card.
 *
 * One is picked at RANDOM per mount (i.e. per visit to Home) whenever there's
 * no more urgent contextual nudge (connect GitHub / create your first project).
 *
 * Copy is TRANSLATION-BASED: each tip's `id` maps to an i18n entry at
 * `overview.homeTip.tips.<id>` → { text, label } (see the locale files). To add
 * a tip, add the `{ id, href }` here AND the matching copy under that key.
 * Capability requirements keep local SaaS's user-owned VPS routes distinct
 * from native self-hosted-only routes such as Jobs.
 */
export interface ProductTip {
  /** i18n key under `overview.homeTip.tips.<id>` → { text, label }. */
  id: string;
  /** In-app destination the tip links to. */
  href: string;
  /** Optional platform capability required by the destination route. */
  requires?: "selfHosted" | "userServers";
}

export interface ProductTipCapabilities {
  selfHosted: boolean;
  userServers: boolean;
}

export function isProductTipAvailable(
  tip: ProductTip,
  capabilities: ProductTipCapabilities,
): boolean {
  if (tip.requires === "selfHosted") return capabilities.selfHosted;
  if (tip.requires === "userServers") return capabilities.userServers;
  return true;
}

export const PRODUCT_TIPS: ProductTip[] = [
  { id: "envVars", href: "/projects" },
  { id: "customDomain", href: "/projects" },
  { id: "autoDeploy", href: "/settings/git" },
  { id: "rollback", href: "/deployments" },
  { id: "apps", href: "/apps" },
  { id: "servers", href: "/servers", requires: "userServers" },
  { id: "jobs", href: "/jobs", requires: "selfHosted" },
  { id: "backups", href: "/backups" },
  { id: "mail", href: "/emails", requires: "userServers" },
  { id: "team", href: "/settings?tab=team" },
];
