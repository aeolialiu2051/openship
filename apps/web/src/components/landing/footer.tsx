import Link from "next/link";
import { landingCopy, type LandingCopy } from "./landing-copy";

export function Footer({ copy = landingCopy.en.footer }: { copy?: LandingCopy["footer"] } = {}) {
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
      </div>
    </footer>
  );
}
