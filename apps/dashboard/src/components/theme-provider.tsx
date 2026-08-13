"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dim" | "dark" | "system";
type ResolvedTheme = "light" | "dim" | "dark";

const LANDING_THEME_STORAGE_KEY = "vibrail-landing-theme";
const THEME_COOKIE = "vibrail-theme";
const SHARED_THEME_COOKIE = "vibrail-shared-theme";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  return value;
}

function readThemeCookie(): Theme | null {
  const value = readCookie(SHARED_THEME_COOKIE) ?? readCookie(THEME_COOKIE);
  return value === "light" || value === "dim" || value === "dark" || value === "system"
    ? value
    : null;
}

function writeThemeCookie(theme: Theme) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const sharedDomain = window.location.hostname === "vibrail.com" || window.location.hostname.endsWith(".vibrail.com")
    ? "; Domain=.vibrail.com"
    : "";
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  document.cookie = `${SHARED_THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${secure}${sharedDomain}`;
}

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  resolvedTheme: "light",
  setTheme: () => {},
  toggle: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function isDesktopApp(): boolean {
  return typeof window !== "undefined" && !!(window as { desktop?: { isDesktop?: boolean } }).desktop?.isDesktop;
}

function resolveTheme(t: Theme): ResolvedTheme {
  if (t === "light" || t === "dim" || t === "dark") return t;
  if (typeof window === "undefined") return "light";
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (!dark) return "light";
  // Desktop's default dark appearance is the softer "dim"; the web product keeps
  // full "dark". Either way an explicit choice (picker/toggle) still wins above.
  return isDesktopApp() ? "dim" : "dark";
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute("data-theme", resolved);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [resolvedTheme, setResolved] = useState<ResolvedTheme>("light");

  // Initialize from localStorage. An explicit stored choice always wins. With
  // no stored preference: the DESKTOP app follows the OS ("system"), while the
  // web product stays light-first. (The desktop window is a native app — users
  // expect it to respect their macOS/Windows appearance.)
  useEffect(() => {
    const stored = readThemeCookie() ?? (
      localStorage.getItem("theme") ?? localStorage.getItem(LANDING_THEME_STORAGE_KEY)
    ) as Theme | null;
    const isDesktop = !!(window as { desktop?: { isDesktop?: boolean } }).desktop?.isDesktop;
    const t: Theme =
      stored === "light" || stored === "dim" || stored === "dark" || stored === "system"
        ? stored
        : isDesktop
          ? "system"
          : "light";
    const resolved = resolveTheme(t);
    setThemeState(t);
    setResolved(resolved);
    writeThemeCookie(t);
    localStorage.setItem(LANDING_THEME_STORAGE_KEY, resolved === "light" ? "light" : "dark");
    applyTheme(resolved);
  }, []);

  // Listen for OS preference changes when in system mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange() {
      const r = resolveTheme("system");
      setResolved(r);
      localStorage.setItem(LANDING_THEME_STORAGE_KEY, r === "light" ? "light" : "dark");
      applyTheme(r);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    const resolved = resolveTheme(t);
    setThemeState(t);
    setResolved(resolved);
    localStorage.setItem("theme", t);
    localStorage.setItem(LANDING_THEME_STORAGE_KEY, resolved === "light" ? "light" : "dark");
    writeThemeCookie(t);
    applyTheme(resolved);
  }, []);

  const toggle = useCallback(() => {
    // Cycle light → dim → dark → light, based on what's currently shown.
    const next: Theme =
      resolvedTheme === "light" ? "dim" : resolvedTheme === "dim" ? "dark" : "light";
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Inline script injected in <head> to set data-theme before hydration - prevents flash */
export function ThemeScript() {
  const script = `
    (function(){
      try {
        var shared = document.cookie.match(/(?:^|;\\s*)${SHARED_THEME_COOKIE}=([^;]+)/);
        var legacy = document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]+)/);
        var t = shared ? decodeURIComponent(shared[1]) : legacy ? decodeURIComponent(legacy[1]) : (localStorage.getItem('theme') || localStorage.getItem('${LANDING_THEME_STORAGE_KEY}'));
        // window.desktop is injected by the Electron preload before this runs.
        var isDesktop = !!(window.desktop && window.desktop.isDesktop);
        var sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        var resolved;
        if (t === 'dark') resolved = 'dark';
        else if (t === 'dim') resolved = 'dim';
        else if (t === 'light') resolved = 'light';
        // 'system': follow the OS. Desktop's default dark appearance is the
        // softer 'dim'; the web product keeps full 'dark'.
        else if (t === 'system') resolved = sysDark ? (isDesktop ? 'dim' : 'dark') : 'light';
        // No stored pref: desktop follows the OS (dark → dim), web stays light-first.
        else resolved = (isDesktop && sysDark) ? 'dim' : 'light';
        document.documentElement.setAttribute('data-theme', resolved);
        localStorage.setItem('${LANDING_THEME_STORAGE_KEY}', resolved === 'light' ? 'light' : 'dark');
      } catch (e) {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
