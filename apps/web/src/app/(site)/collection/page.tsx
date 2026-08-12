import type { Metadata } from "next";
import { CollectionPage, type Project as CollectionProject } from "@/components/collection/collection-page";
import { cookies, headers } from "next/headers";
import { LANDING_LOCALE_COOKIE, parseLandingLocale } from "@/lib/landing-locale";
import { CLOUD_API_URL, CLOUD_DASHBOARD_URL, DEFAULT_PORT, resolveDashboardPageUrl } from "@repo/core";
import { hasVisualPreview } from "@/lib/frameworks";
import { resolveCollectionApiUrls } from "@/lib/collection-api-url";

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
  const requestHeaders = await headers();
  const initialLocale = parseLandingLocale(cookieStore.get(LANDING_LOCALE_COOKIE)?.value);
  const dashboardBaseUrl = process.env.NODE_ENV === "development"
    ? `http://localhost:${DEFAULT_PORT.vibrailSaasDashboard}`
    : CLOUD_DASHBOARD_URL;
  const dashboardLoginUrl = resolveDashboardPageUrl(dashboardBaseUrl, "/login");
  const { serverApiUrl, browserApiUrl } = resolveCollectionApiUrls({
    nodeEnv: process.env.NODE_ENV,
    internalApiUrl: process.env.VIBRAIL_API_URL,
    publicApiUrl: process.env.NEXT_PUBLIC_VIBRAIL_API_URL,
    cloudApiUrl: CLOUD_API_URL,
  });
  let projects: CollectionProject[] = [];
  let initialAuthenticated = false;
  try {
    const cookie = requestHeaders.get("cookie");
    const response = await fetch(`${serverApiUrl}/api/collection`, {
      cache: "no-store",
      headers: cookie ? { cookie } : undefined,
    });
    if (response.ok) {
      const payload = await response.json();
      projects = payload.data ?? [];
      initialAuthenticated = Boolean(payload.authenticated);
    }
  } catch {
    // The public site remains usable while the API is unavailable.
  }
  // Never probe every deployed site in the navigation critical path. Known
  // visual frameworks are definitely previewable; ambiguous Docker/Compose
  // services intentionally remain `undefined` so the client can optimistically
  // try their iframe without delaying the route response.
  projects = projects.map((project) => ({
    ...project,
    previewable: hasVisualPreview(project.framework) ? true : undefined,
  }));
  return <CollectionPage initialProjects={projects} initialAuthenticated={initialAuthenticated} initialLocale={initialLocale} dashboardLoginUrl={dashboardLoginUrl} apiUrl={browserApiUrl} />;
}
