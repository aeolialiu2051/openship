"use client";

import { Gamepad2, Mail, MessageCircle } from "lucide-react";
import { landingCopy, type LandingLocale } from "./landing-copy";
import { Footer } from "./footer";
import { Navbar } from "./navbar";
import { useLandingPreferences } from "./use-landing-preferences";

const aboutCopy = {
  en: {
    title: "Contact Vibrail",
    email: "Email",
    wechat: "WeChat",
    discord: "Discord",
    contactLabel: "Vibrail contact information",
  },
  zh: {
    title: "联系 Vibrail",
    email: "邮箱",
    wechat: "微信",
    discord: "Discord",
    contactLabel: "Vibrail 联系方式",
  },
} as const;

export function AboutPage({
  initialLocale,
  supportEmail,
  wechatId,
  discordUrl,
  dashboardLoginUrl,
}: {
  initialLocale?: LandingLocale;
  supportEmail: string | null;
  wechatId: string | null;
  discordUrl: string | null;
  dashboardLoginUrl: string;
}) {
  const { locale, setLocale, theme, setTheme } = useLandingPreferences(initialLocale);
  const landing = landingCopy[locale];
  const copy = aboutCopy[locale];

  return (
    <div className={`vr-site vr-theme-${theme} vr-about-site`} data-locale={locale}>
      <Navbar
        copy={landing.nav}
        locale={locale}
        theme={theme}
        onLocaleChange={setLocale}
        onToggleTheme={() => setTheme((current) => current === "dark" ? "light" : "dark")}
      />

      <main className="vr-about-main">
        <img src="/android-chrome-192x192.png" alt="Vibrail" className="vr-about-logo" />
        <section className="vr-about-card" aria-label={copy.contactLabel}>
          <h1>{copy.title}</h1>
          <dl>
            {supportEmail && (
              <div>
                <dt><Mail aria-hidden="true" />{copy.email}:</dt>
                <dd><a href={`mailto:${supportEmail}`}>{supportEmail}</a></dd>
              </div>
            )}
            {wechatId && (
              <div>
                <dt><MessageCircle aria-hidden="true" />{copy.wechat}:</dt>
                <dd>{wechatId}</dd>
              </div>
            )}
            {discordUrl && (
              <div>
                <dt><Gamepad2 aria-hidden="true" />{copy.discord}:</dt>
                <dd>
                  <a href={discordUrl} target="_blank" rel="noreferrer">
                    Vibrail
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </section>
      </main>
      <Footer
        copy={landing.footer}
        supportEmail={supportEmail}
        dashboardLoginUrl={dashboardLoginUrl}
        theme={theme}
      />
    </div>
  );
}
