import type { LandingLocale } from "@/components/landing/landing-copy";

/** Shared with apps/dashboard so language survives landing ↔ dashboard navigation. */
export const LANDING_LOCALE_COOKIE = "vibrail-locale";
export const LANDING_LOCALE_STORAGE_KEY = "vibrail-landing-locale";

export function parseLandingLocale(value?: string): LandingLocale | undefined {
  return value === "en" || value === "zh" ? value : undefined;
}
