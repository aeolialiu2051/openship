"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Footer } from "./footer";
import { landingCopy, type LandingLocale } from "./landing-copy";
import { legalCopy, type LegalDocument } from "./legal-copy";
import { Navbar } from "./navbar";
import { useLandingPreferences } from "./use-landing-preferences";

export function LegalPage({
  document,
  initialLocale,
  supportEmail,
}: {
  document: LegalDocument;
  initialLocale?: LandingLocale;
  supportEmail: string | null;
}) {
  const { locale, setLocale, theme, setTheme } = useLandingPreferences(initialLocale);
  const copy = landingCopy[locale];
  const legal = legalCopy[locale];
  const page = legal[document];

  return (
    <div className={`vr-site vr-theme-${theme} vr-legal-site`} data-locale={locale}>
      <Navbar
        copy={copy.nav}
        locale={locale}
        theme={theme}
        onLocaleChange={setLocale}
        onToggleTheme={() => setTheme((current) => current === "dark" ? "light" : "dark")}
      />
      <main className="vr-legal">
        <header className="vr-legal-hero">
          <span>{legal.common.legal}</span>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
          <div>
            <time dateTime="2026-08-04">{legal.common.lastUpdated}</time>
            <Link href="/" prefetch={false}><ArrowLeft size={14} /> {copy.footer.homeLabel}</Link>
          </div>
        </header>

        <div className="vr-legal-layout">
          <aside className="vr-legal-toc" aria-label={legal.common.contents}>
            <span>{legal.common.contents}</span>
            <ol>
              {page.sections.map(([title], index) => (
                <li key={title}><a href={`#section-${index + 1}`}><b>{String(index + 1).padStart(2, "0")}</b>{title}</a></li>
              ))}
            </ol>
          </aside>

          <article className="vr-legal-article">
            {page.sections.map(([title, body], index) => (
              <section id={`section-${index + 1}`} key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><h2>{title}</h2><p>{body}</p></div>
              </section>
            ))}
            {supportEmail && (
              <p className="vr-legal-contact">
                {legal.common.contact} <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
              </p>
            )}
          </article>
        </div>
      </main>
      <Footer copy={copy.footer} supportEmail={supportEmail} />
    </div>
  );
}
