import type { Metadata } from "next";
import { CollectionPage } from "@/components/collection/collection-page";
import { cookies } from "next/headers";
import { LANDING_LOCALE_COOKIE, parseLandingLocale } from "@/lib/landing-locale";
import { CLOUD_DASHBOARD_URL, resolveDashboardPageUrl } from "@repo/core";

export const metadata: Metadata = {
  title: "Collection",
  description: "Explore projects built and deployed with Vibrail.",
};

export const revalidate = 60;

export default async function Page() {
  const cookieStore = await cookies();
  const initialLocale = parseLandingLocale(cookieStore.get(LANDING_LOCALE_COOKIE)?.value);
  const dashboardLoginUrl = resolveDashboardPageUrl(CLOUD_DASHBOARD_URL, "/login");
  const apiUrl = (process.env.VIBRAIL_API_URL || process.env.NEXT_PUBLIC_VIBRAIL_API_URL || "http://localhost:4100").replace(/\/$/, "");
  let projects = [];
  try {
    const response = await fetch(`${apiUrl}/api/collection`, { next: { revalidate: 60 } });
    if (response.ok) projects = (await response.json()).data ?? [];
  } catch {
    // The public site remains usable while the API is unavailable.
  }
  return <CollectionPage initialProjects={projects} initialLocale={initialLocale} dashboardLoginUrl={dashboardLoginUrl} />;
}
