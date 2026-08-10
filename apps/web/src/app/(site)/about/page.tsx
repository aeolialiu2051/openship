import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AboutPage } from "@/components/landing/about-page";
import { LANDING_LOCALE_COOKIE, parseLandingLocale } from "@/lib/landing-locale";
import { getSupportEmail } from "@/lib/support-email";
import { CLOUD_DASHBOARD_URL, resolveDashboardPageUrl } from "@repo/core";

export const metadata: Metadata = {
  title: "About",
  description: "Contact Vibrail by email or WeChat.",
  alternates: { canonical: "/about" },
};

export default async function AboutRoute() {
  const cookieStore = await cookies();
  const initialLocale = parseLandingLocale(cookieStore.get(LANDING_LOCALE_COOKIE)?.value);
  const wechatId = process.env.WECHAT_ID?.trim() || null;
  const dashboardLoginUrl = resolveDashboardPageUrl(CLOUD_DASHBOARD_URL, "/login");

  return (
    <AboutPage
      initialLocale={initialLocale}
      supportEmail={getSupportEmail()}
      wechatId={wechatId}
      dashboardLoginUrl={dashboardLoginUrl}
    />
  );
}
