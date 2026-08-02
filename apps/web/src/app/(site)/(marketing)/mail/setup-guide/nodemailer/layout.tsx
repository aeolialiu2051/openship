import type { Metadata } from "next";
import type { ReactNode } from "react";

const TITLE = "Send Mail via Code (Nodemailer / SMTP)";
const DESCRIPTION =
  "Send transactional email from your app over SMTP. A Node.js / Nodemailer example — the same credentials and fields work in any language.";
const PATH = "/mail/setup-guide/nodemailer";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: {
    title: `${TITLE} - Vibrail`,
    description: DESCRIPTION,
    url: PATH,
    type: "article",
    siteName: "Vibrail",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: `${TITLE} - Vibrail`, description: DESCRIPTION },
};

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
