import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LegalPage } from "@/components/landing/legal-page";
import { LANDING_LOCALE_COOKIE, parseLandingLocale } from "@/lib/landing-locale";
import { getSupportEmail } from "@/lib/support-email";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Vibrail collects, uses, protects, and retains information.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage() {
  const cookieStore = await cookies();
  const initialLocale = parseLandingLocale(cookieStore.get(LANDING_LOCALE_COOKIE)?.value);

  return <LegalPage document="privacy" initialLocale={initialLocale} supportEmail={getSupportEmail()} />;
}
