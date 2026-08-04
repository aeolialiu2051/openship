"use client";

import { useEffect, useState } from "react";
import { LANDING_LOCALE_COOKIE } from "@/lib/landing-locale";
import type { LandingLocale, LandingTheme } from "./landing-copy";

const LOCALE_STORAGE_KEY = LANDING_LOCALE_COOKIE;
const THEME_STORAGE_KEY = "vibrail-landing-theme";

export function useLandingPreferences(initialLocale?: LandingLocale) {
  const [locale, setLocale] = useState<LandingLocale>(initialLocale ?? "en");
  const [theme, setTheme] = useState<LandingTheme>("dark");

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (!initialLocale) {
      if (storedLocale === "en" || storedLocale === "zh") {
        setLocale(storedLocale);
      } else {
        setLocale(window.navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en");
      }
    }
    setTheme(
      storedTheme === "dark" || storedTheme === "light"
        ? storedTheme
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark",
    );
  }, [initialLocale]);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LANDING_LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.vrTheme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [locale, theme]);

  return { locale, setLocale, theme, setTheme };
}
