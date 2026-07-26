export const locales = ["en", "ar", "es", "fr", "de", "pt", "ja", "zh", "tr"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "openship-locale";

const rtlLocales = new Set<Locale>(["ar"]);

export function isRtl(locale: Locale): boolean {
  return rtlLocales.has(locale);
}
