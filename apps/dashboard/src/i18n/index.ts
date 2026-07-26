/**
 * Lightweight public i18n surface safe to import from client components.
 * Dictionary data lives in `dictionaries.ts` so the 255 KB English fallback
 * does not become part of every route's shared JavaScript.
 */
export {
  defaultLocale,
  isRtl,
  LOCALE_COOKIE,
  locales,
  type Locale,
} from "./config";
export type { Dictionary } from "./types";
