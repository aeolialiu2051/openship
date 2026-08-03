"use client";

import { useEffect, useState } from "react";
import type { LandingLocale, LandingTheme } from "./landing-copy";

const LOCALE_STORAGE_KEY = "vibrail-landing-locale";
const THEME_STORAGE_KEY = "vibrail-landing-theme";

export function useLandingPreferences() {
  const [locale, setLocale] = useState<LandingLocale>("en");
  const [theme, setTheme] = useState<LandingTheme>("dark");

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    setLocale(
      storedLocale === "en" || storedLocale === "zh"
        ? storedLocale
        : window.navigator.language.toLowerCase().startsWith("zh")
          ? "zh"
          : "en",
    );
    setTheme(
      storedTheme === "dark" || storedTheme === "light"
        ? storedTheme
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark",
    );
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.vrTheme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [locale, theme]);

  return { locale, setLocale, theme, setTheme };
}
