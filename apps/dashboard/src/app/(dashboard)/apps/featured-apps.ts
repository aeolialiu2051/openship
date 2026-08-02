import {
  Activity,
  BarChart3,
  Database,
  FileText,
  KeyRound,
  Mail,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface FeaturedApp {
  id: string;
  name: string;
  /** Fallback icon if the brand logo can't load. */
  icon: LucideIcon;
}

/** Shared product-priority order for every featured-app preview. */
export const FEATURED_APPS: readonly FeaturedApp[] = [
  { id: "mail", name: "Vibrail Mail", icon: Mail },
  { id: "cli-proxy-api", name: "CLIProxyAPI", icon: Activity },
  { id: "n8n", name: "n8n", icon: Workflow },
  { id: "supabase", name: "Supabase", icon: Database },
  { id: "convex", name: "Convex", icon: Database },
  { id: "mongodb", name: "MongoDB", icon: Database },
  { id: "ghost", name: "Ghost", icon: FileText },
  { id: "uptime-kuma", name: "Uptime Kuma", icon: Activity },
  { id: "vaultwarden", name: "Vaultwarden", icon: KeyRound },
  { id: "metabase", name: "Metabase", icon: BarChart3 },
];
