import type { LandingLocale } from "@/components/landing/landing-copy";

export const LANDING_LOCALE_COOKIE = "vibrail-landing-locale";

export function parseLandingLocale(value?: string): LandingLocale | undefined {
  return value === "en" || value === "zh" ? value : undefined;
}
