import { cookies, headers } from "next/headers";
import { defaultLocale, LOCALE_COOKIE, locales, type Locale } from "@/i18n";

/**
 * Resolve the request locale on the server: explicit cookie (mirrored onto the
 * `x-vibrail-locale` header by the proxy) first, then the browser's
 * Accept-Language, else the default. Keeps SSR and first paint in the right
 * language (no English→Arabic flash on load).
 *
 * Shared by the root layout (which seeds the I18nProvider) and any server
 * component that needs to format locale-sensitive content (e.g. the billing
 * PRO-period line) without a client round-trip.
 */
export async function getRequestLocale(): Promise<Locale> {
  const hdrs = await headers();

  // The proxy (src/proxy.ts) mirrors the locale cookie onto this header — the
  // reliable path, since `cookies()` / the raw Cookie header can come back
  // empty in the SSR render. Fall back to cookies() (works in dev), then
  // Accept-Language, then the default.
  const cookieStore = await cookies();
  const fromCookie =
    hdrs.get("x-vibrail-locale") ?? cookieStore.get(LOCALE_COOKIE)?.value;
  if (fromCookie && (locales as readonly string[]).includes(fromCookie)) {
    return fromCookie as Locale;
  }

  const accept = hdrs.get("accept-language") ?? "";
  const pref = accept.split(",")[0]?.split("-")[0]?.trim().toLowerCase();
  if (pref && (locales as readonly string[]).includes(pref)) return pref as Locale;
  return defaultLocale;
}
