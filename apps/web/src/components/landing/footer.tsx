import Link from "next/link";
import { Mail } from "lucide-react";
import { landingCopy, type LandingCopy } from "./landing-copy";

type FooterProps = {
  copy?: LandingCopy["footer"];
  supportEmail?: string | null;
};

export function Footer({ copy = landingCopy.en.footer, supportEmail }: FooterProps = {}) {
  return (
    <footer className="vr-footer">
      <div className="vr-footer-main">
        <div>
          <Link href="/" className="vr-brand" aria-label={copy.homeLabel}>
            <img src="/apple-touch-icon.png" alt="" className="vr-brand-logo" />
            <span>Vibrail</span>
          </Link>
          <p>{copy.description}</p>
        </div>
        <div className="vr-footer-links">
          <div>
            <span>{copy.product}</span>
            <Link href="/#platform">{copy.platform}</Link>
            <Link href="/#workflow">{copy.workflow}</Link>
            <Link href="/#operations">{copy.operations}</Link>
          </div>
          <div>
            <span>{copy.developers}</span>
            <a href="https://docs.vibrail.warpgateapi.com/">{copy.documentation}</a>
            <a href="https://docs.vibrail.warpgateapi.com/#/docs/cli">{copy.cliReference}</a>
            <a href="https://docs.vibrail.warpgateapi.com/#/docs/mcp">{copy.mcpServer}</a>
          </div>
          <div>
            <span>{copy.deploy}</span>
            <Link href="/login">{copy.cloud}</Link>
            <a href="https://docs.vibrail.warpgateapi.com/#/docs/deploy/server">{copy.connectVps}</a>
            <a href="https://docs.vibrail.warpgateapi.com/#/docs/quickstart">{copy.quickstart}</a>
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
          <Link href="/privacy">{copy.privacy}</Link>
          <Link href="/terms">{copy.terms}</Link>
        </div>
      </div>
    </footer>
  );
}
