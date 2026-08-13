import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CLOUD_DASHBOARD_URL, resolveDashboardPageUrl } from "@repo/core";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Vibrail account.",
  robots: { index: false, follow: false, nocache: true },
  alternates: { canonical: resolveDashboardPageUrl(CLOUD_DASHBOARD_URL, "/login") },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
