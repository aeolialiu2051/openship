import type { LandingTheme } from "./landing-copy";

type LandingTransitionTheme = LandingTheme | "auto";

export function LandingTransition({ theme = "auto" }: { theme?: LandingTransitionTheme }) {
  return (
    <div
      className={`vr-dashboard-transition vr-dashboard-transition-${theme}`}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <img src="/apple-touch-icon.png" alt="" />
      <span>Vibrail</span>
      <i aria-hidden="true" />
    </div>
  );
}
