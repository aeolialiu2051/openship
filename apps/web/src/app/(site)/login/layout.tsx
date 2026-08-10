import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Vibrail account.",
  robots: { index: false, follow: false, nocache: true },
  alternates: { canonical: `${SITE_URL}/dashboard/login` },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
