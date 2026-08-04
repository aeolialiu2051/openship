"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Languages, Moon, Sun } from "lucide-react";
import { landingCopy, type LandingCopy, type LandingLocale, type LandingTheme } from "./landing-copy";

const DOCS_URL = "https://docs.vibrail.warpgateapi.com/";

type NavbarProps = {
  copy?: LandingCopy["nav"];
  locale?: LandingLocale;
  theme?: LandingTheme;
  onLocaleChange?: (locale: LandingLocale) => void;
  onToggleTheme?: () => void;
};

export function Navbar({
  copy = landingCopy.en.nav,
  locale = "en",
  theme = "dark",
  onLocaleChange,
  onToggleTheme,
}: NavbarProps = {}) {
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!languageMenuOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) setLanguageMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLanguageMenuOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [languageMenuOpen]);

  const selectLocale = (nextLocale: LandingLocale) => {
    if (nextLocale !== locale) onLocaleChange?.(nextLocale);
    setLanguageMenuOpen(false);
  };

  return (
    <header className="vr-nav-shell">
      <div className="vr-nav">
        <Link href="/" className="vr-brand" aria-label={copy.homeLabel}>
          <img src="/apple-touch-icon.png" alt="" className="vr-brand-logo" />
          <span>Vibrail</span>
        </Link>

        <nav className="vr-nav-links" aria-label={copy.mainLabel}>
          <Link href="/#platform">{copy.platform}</Link>
          <Link href="/#workflow">{copy.workflow}</Link>
          <Link href="/#operations">{copy.operations}</Link>
          <a href={DOCS_URL}>{copy.docs}</a>
        </nav>

        <div className="vr-nav-actions">
          {onLocaleChange && (
            <div className="vr-language-picker" ref={languageMenuRef}>
              <button
                type="button"
                className={`vr-nav-control${languageMenuOpen ? " is-active" : ""}`}
                onClick={() => setLanguageMenuOpen((open) => !open)}
                aria-label={copy.languageMenuLabel}
                title={copy.languageMenuLabel}
                aria-haspopup="menu"
                aria-expanded={languageMenuOpen}
              >
                <Languages size={18} />
              </button>
              {languageMenuOpen && (
                <div className="vr-language-menu" role="menu" aria-label={copy.languageMenuLabel}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={locale === "zh"}
                    onClick={() => selectLocale("zh")}
                  >
                    <span>简体中文</span>
                    {locale === "zh" && <Check size={17} />}
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={locale === "en"}
                    onClick={() => selectLocale("en")}
                  >
                    <span>English</span>
                    {locale === "en" && <Check size={17} />}
                  </button>
                </div>
              )}
            </div>
          )}
          {onToggleTheme && (
            <button
              type="button"
              className="vr-nav-control vr-theme-control"
              onClick={onToggleTheme}
              aria-label={theme === "dark" ? copy.themeLightLabel : copy.themeDarkLabel}
              title={theme === "dark" ? copy.themeLightLabel : copy.themeDarkLabel}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
