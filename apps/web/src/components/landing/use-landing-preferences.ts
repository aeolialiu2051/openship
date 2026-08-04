"use client";

import { useCallback, useEffect, useState, type SetStateAction } from "react";
import { LANDING_LOCALE_COOKIE, LANDING_LOCALE_STORAGE_KEY } from "@/lib/landing-locale";
import type { LandingLocale, LandingTheme } from "./landing-copy";

const LOCALE_STORAGE_KEY = LANDING_LOCALE_STORAGE_KEY;
const THEME_STORAGE_KEY = "vibrail-landing-theme";
const DASHBOARD_THEME_STORAGE_KEY = "theme";
const THEME_COOKIE = "vibrail-theme";

function readThemeCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function dashboardThemeForLanding(theme: LandingTheme): "light" | "dim" {
  return theme === "light" ? "light" : "dim";
}

function writeThemeCookie(theme: LandingTheme) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${THEME_COOKIE}=${dashboardThemeForLanding(theme)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

function resolveLandingTheme(value: string | null): LandingTheme | null {
  if (value === "light") return "light";
  if (value === "dark" || value === "dim") return "dark";
  if (value === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return null;
}

export function useLandingPreferences(initialLocale?: LandingLocale) {
  const [locale, setLocale] = useState<LandingLocale>(initialLocale ?? "en");
  const [theme, setTheme] = useState<LandingTheme>("dark");

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    const storedCookieTheme = readThemeCookie();
    const cookieTheme = resolveLandingTheme(storedCookieTheme);
    const dashboardTheme = resolveLandingTheme(window.localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY));
    const landingTheme = resolveLandingTheme(window.localStorage.getItem(THEME_STORAGE_KEY));

    if (!initialLocale) {
      if (storedLocale === "en" || storedLocale === "zh") {
        setLocale(storedLocale);
      } else {
        setLocale(window.navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en");
      }
    }
    const resolvedTheme = cookieTheme ?? dashboardTheme ?? landingTheme ?? (
      window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
    );
    setTheme(resolvedTheme);
    if (!storedCookieTheme) writeThemeCookie(resolvedTheme);
  }, [initialLocale]);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LANDING_LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.vrTheme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [locale, theme]);

  const updateTheme = useCallback((value: SetStateAction<LandingTheme>) => {
    setTheme((current) => {
      const next = typeof value === "function" ? value(current) : value;
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      window.localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, dashboardThemeForLanding(next));
      writeThemeCookie(next);
      return next;
    });
  }, []);

  return { locale, setLocale, theme, setTheme: updateTheme };
}
