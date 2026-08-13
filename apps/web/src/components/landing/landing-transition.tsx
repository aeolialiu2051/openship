import type { LandingTheme } from "./landing-copy";

export function LandingTransition({ theme = "dark" }: { theme?: LandingTheme }) {
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
