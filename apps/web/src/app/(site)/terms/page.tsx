import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LegalPage } from "@/components/landing/legal-page";
import { LANDING_LOCALE_COOKIE, parseLandingLocale } from "@/lib/landing-locale";
import { getSupportEmail } from "@/lib/support-email";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing access to and use of the Vibrail deployment platform.",
  alternates: { canonical: "/terms" },
};

export default async function TermsPage() {
  const cookieStore = await cookies();
  const initialLocale = parseLandingLocale(cookieStore.get(LANDING_LOCALE_COOKIE)?.value);
  return <LegalPage document="terms" initialLocale={initialLocale} supportEmail={getSupportEmail()} />;
}
