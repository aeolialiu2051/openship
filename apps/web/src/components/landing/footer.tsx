import Link from "next/link";
import { Mail } from "lucide-react";
import { landingCopy, type LandingCopy, type LandingTheme } from "./landing-copy";
import { DashboardLink } from "./dashboard-link";

type FooterProps = {
  copy?: LandingCopy["footer"];
  supportEmail?: string | null;
  dashboardLoginUrl?: string;
  theme?: LandingTheme;
};

export function Footer({ copy = landingCopy.en.footer, supportEmail, dashboardLoginUrl = "/login", theme = "dark" }: FooterProps = {}) {
  return (
    <footer className="vr-footer">
      <div className="vr-footer-main">
        <div>
          <Link href="/" prefetch={false} className="vr-brand" aria-label={copy.homeLabel}>
            <img src="/apple-touch-icon.png" alt="" className="vr-brand-logo" />
            <span>Vibrail</span>
          </Link>
          <p>{copy.description}</p>
        </div>
        <div className="vr-footer-links">
          <div>
            <span>{copy.product}</span>
            <Link href="/#platform" prefetch={false}>{copy.platform}</Link>
            <Link href="/#workflow" prefetch={false}>{copy.workflow}</Link>
            <Link href="/#operations" prefetch={false}>{copy.operations}</Link>
          </div>
          <div>
            <span>{copy.developers}</span>
            <a href="https://docs.vibrail.com/">{copy.documentation}</a>
            <a href="https://docs.vibrail.com/#/docs/cli">{copy.cliReference}</a>
            <a href="https://docs.vibrail.com/#/docs/mcp">{copy.mcpServer}</a>
          </div>
          <div>
            <span>{copy.deploy}</span>
            <DashboardLink href={dashboardLoginUrl} theme={theme}>{copy.cloud}</DashboardLink>
            <a href="https://docs.vibrail.com/#/docs/deploy/server">{copy.connectVps}</a>
            <a href="https://docs.vibrail.com/#/docs/quickstart">{copy.quickstart}</a>
          </div>
        </div>
      </div>
      <div className="vr-footer-bottom">
        <span>© {new Date().getFullYear()} Vibrail.</span>
        <div className="vr-footer-legal">
          {supportEmail && (
            <a href={`mailto:${supportEmail}`}>
              <Mail size={14} aria-hidden="true" />
              <span>{supportEmail}</span>
            </a>
          )}
          <Link href="/privacy" prefetch={false}>{copy.privacy}</Link>
          <Link href="/terms" prefetch={false}>{copy.terms}</Link>
        </div>
      </div>
    </footer>
  );
}
