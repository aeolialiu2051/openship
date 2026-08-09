import { VibrailLanding } from "@/components/landing/vibrail-landing";
import { cookies } from "next/headers";
import { LANDING_LOCALE_COOKIE, parseLandingLocale } from "@/lib/landing-locale";
import { getSupportEmail } from "@/lib/support-email";
import { CLOUD_DASHBOARD_URL, resolveDashboardPageUrl } from "@repo/core";

const SITE_URL = "https://vibrail.com";

const softwareLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Vibrail",
  applicationCategory: "DeveloperApplication",
  applicationSubCategory: "Deployment Platform",
  operatingSystem: "macOS, Windows, Linux, Web",
  url: SITE_URL,
  description: "Deployment infrastructure that turns human- and agent-created code into reliable services on Vibrail Cloud or Linux VPS environments.",
  offers: { "@type": "Offer", category: "Cloud and VPS deployment" },
};

export default async function HomePage() {
  const cookieStore = await cookies();
  const initialLocale = parseLandingLocale(cookieStore.get(LANDING_LOCALE_COOKIE)?.value);
  const supportEmail = getSupportEmail();
  const dashboardLoginUrl = resolveDashboardPageUrl(CLOUD_DASHBOARD_URL, "/login");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd) }} />
      <VibrailLanding
        initialLocale={initialLocale}
        supportEmail={supportEmail}
        dashboardLoginUrl={dashboardLoginUrl}
      />
    </>
  );
}
