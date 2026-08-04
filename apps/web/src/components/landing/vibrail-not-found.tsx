"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Footer } from "./footer";
import { landingCopy, type LandingLocale } from "./landing-copy";
import { Navbar } from "./navbar";
import { useLandingPreferences } from "./use-landing-preferences";

const notFoundCopy = {
  en: {
    eyebrow: "404",
    title: "Page not",
    accent: "found.",
    description: "The page you’re looking for doesn’t exist or has been removed.",
    action: "Back to Vibrail",
  },
  zh: {
    eyebrow: "404",
    title: "页面",
    accent: "不存在。",
    description: "你访问的页面不存在，或已经被移除。",
    action: "返回 Vibrail 首页",
  },
} as const;

export function VibrailNotFound({ initialLocale }: { initialLocale?: LandingLocale }) {
  const { locale, setLocale, theme, setTheme } = useLandingPreferences(initialLocale);
  const landing = landingCopy[locale];
  const copy = notFoundCopy[locale];

  return (
    <div className={`vr-site vr-not-found-site vr-theme-${theme}`} data-locale={locale}>
      <Navbar
        copy={landing.nav}
        locale={locale}
        theme={theme}
        onLocaleChange={setLocale}
        onToggleTheme={() => setTheme((current) => current === "dark" ? "light" : "dark")}
      />
      <main className="vr-not-found">
        <div className="vr-not-found-grid" aria-hidden="true" />
        <section className="vr-not-found-copy">
          <p>{copy.eyebrow}</p>
          <h1>{copy.title}<span>{copy.accent}</span></h1>
          <div>{copy.description}</div>
          <Link href="/" className="vr-button vr-button-primary">
            {copy.action} <ArrowRight size={17} />
          </Link>
        </section>
      </main>
      <Footer copy={landing.footer} />
    </div>
  );
}
