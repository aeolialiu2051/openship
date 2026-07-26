import type { Locale } from "./config";

/** The SSR-seeded locale must not be fetched again during hydration. */
export function shouldLoadDictionary(locale: Locale, loadedLocale: Locale): boolean {
  return locale !== loadedLocale;
}
