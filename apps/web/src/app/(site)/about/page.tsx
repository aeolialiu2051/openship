import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AboutPage } from "@/components/landing/about-page";
import { LANDING_LOCALE_COOKIE, parseLandingLocale } from "@/lib/landing-locale";
import { getSupportEmail } from "@/lib/support-email";
import { CLOUD_DASHBOARD_URL, resolveDashboardPageUrl } from "@repo/core";

export const metadata: Metadata = {
  title: "About",
  description: "Contact Vibrail by email, WeChat, or Discord.",
  alternates: { canonical: "/about" },
};

export const dynamic = "force-dynamic";

export default async function AboutRoute() {
  const cookieStore = await cookies();
  const initialLocale = parseLandingLocale(cookieStore.get(LANDING_LOCALE_COOKIE)?.value);
  let wechatId = process.env.WECHAT_ID?.trim() || null;
  let discordUrl = process.env.DISCORD_LINK?.trim() || null;
  const apiUrl = (
    process.env.VIBRAIL_API_URL ||
    process.env.NEXT_PUBLIC_VIBRAIL_API_URL ||
    "http://localhost:4100"
  ).replace(/\/$/, "");
  try {
    const response = await fetch(`${apiUrl}/api/health/env`, { cache: "no-store" });
    if (response.ok) {
      const config = await response.json() as {
        wechatId?: string | null;
        discordLink?: string | null;
      };
      wechatId = config.wechatId?.trim() || null;
      discordUrl = config.discordLink?.trim() || null;
    }
  } catch {
    // Keep environment defaults while the API is temporarily unavailable.
  }
  const dashboardLoginUrl = resolveDashboardPageUrl(CLOUD_DASHBOARD_URL, "/login");

  return (
    <AboutPage
      initialLocale={initialLocale}
      supportEmail={getSupportEmail()}
      wechatId={wechatId}
      discordUrl={discordUrl}
      dashboardLoginUrl={dashboardLoginUrl}
    />
  );
}
