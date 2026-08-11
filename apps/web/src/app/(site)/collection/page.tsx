import type { Metadata } from "next";
import { CollectionPage, type Project as CollectionProject } from "@/components/collection/collection-page";
import { cookies } from "next/headers";
import { LANDING_LOCALE_COOKIE, parseLandingLocale } from "@/lib/landing-locale";
import { CLOUD_DASHBOARD_URL, resolveDashboardPageUrl } from "@repo/core";
import { resolveCollectionPreview } from "@/lib/collection-preview";

export const metadata: Metadata = {
  title: "Collection",
  description: "Explore projects built and deployed with Vibrail.",
};

// Collection visibility is user-controlled from project settings. Keep this
// route dynamic so opting out is reflected on the very next page load instead
// of serving a previously cached public listing.
export const dynamic = "force-dynamic";

export default async function Page() {
  const cookieStore = await cookies();
  const initialLocale = parseLandingLocale(cookieStore.get(LANDING_LOCALE_COOKIE)?.value);
  const dashboardLoginUrl = resolveDashboardPageUrl(CLOUD_DASHBOARD_URL, "/login");
  const apiUrl = (process.env.VIBRAIL_API_URL || process.env.NEXT_PUBLIC_VIBRAIL_API_URL || "http://localhost:4100").replace(/\/$/, "");
  let projects: CollectionProject[] = [];
  try {
    const response = await fetch(`${apiUrl}/api/collection`, { cache: "no-store" });
    if (response.ok) projects = (await response.json()).data ?? [];
  } catch {
    // The public site remains usable while the API is unavailable.
  }
  projects = await Promise.all(
    projects.map(async (project) => ({
      ...project,
      previewable: await resolveCollectionPreview(project),
    })),
  );
  return <CollectionPage initialProjects={projects} initialLocale={initialLocale} dashboardLoginUrl={dashboardLoginUrl} />;
}
