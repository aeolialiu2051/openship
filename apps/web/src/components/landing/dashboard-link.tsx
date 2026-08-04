"use client";

import { useState, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LandingTheme } from "./landing-copy";

type DashboardLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: string;
  theme: LandingTheme;
};

/**
 * The marketing site and dashboard are separate Next.js applications. A plain
 * anchor deliberately performs a document navigation across that boundary;
 * next/link would try a same-app RSC transition before the edge hands the
 * request to the dashboard application.
 */
export function DashboardLink({ children, href, theme, onClick, ...props }: DashboardLinkProps) {
  const [isLeaving, setIsLeaving] = useState(false);

  return (
    <>
      <a
        {...props}
        href={href}
        onClick={(event) => {
          window.localStorage.setItem("theme", theme === "light" ? "light" : "dim");
          onClick?.(event);
          const opensElsewhere =
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.currentTarget.target === "_blank";
          if (!event.defaultPrevented && !opensElsewhere) setIsLeaving(true);
        }}
      >
        {children}
      </a>
      {isLeaving && createPortal(
        <div
          className={`vr-dashboard-transition vr-dashboard-transition-${theme}`}
          role="status"
          aria-live="polite"
        >
          <img src="/apple-touch-icon.png" alt="" />
          <span>Vibrail</span>
          <i aria-hidden="true" />
        </div>,
        document.body,
      )}
    </>
  );
}
