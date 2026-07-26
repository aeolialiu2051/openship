export const locales = ["en", "ar", "es", "fr", "de", "pt", "ja", "zh", "tr"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "openship-locale";

const rtlLocales = new Set<Locale>(["ar"]);

/** Direction of text written in a locale's native script. */
export function isRtl(locale: Locale): boolean {
  return rtlLocales.has(locale);
}

/**
 * Keep the dashboard chrome in one stable spatial layout across languages.
 * Locale-specific text can still opt into RTL with `isRtl`.
 */
export function getUiDirection(_locale: Locale): "ltr" {
  return "ltr";
}
