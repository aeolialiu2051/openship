import type { Metadata, Viewport } from "next";
import { SITE_URL } from "@/lib/site-url";
import "../globals.css";

const SITE_NAME = "Vibrail";
const TITLE_DEFAULT = "Vibrail — Ship Software on Your Infrastructure";
const TITLE_TEMPLATE = "%s - Vibrail";
const DESCRIPTION =
  "Deployment infrastructure that turns human- and agent-created code into reliable services on Vibrail Cloud or Linux VPS environments, with immutable releases, automatic routing, live operations, and instant rollback.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE_DEFAULT,
    template: TITLE_TEMPLATE,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  generator: "Next.js",
  category: "technology",
  keywords: [
    "deployment platform",
    "self-hosted",
    "deployment control plane",
    "vibe coding",
    "agentic deployment",
    "Vercel alternative",
    "Heroku alternative",
    "Netlify alternative",
    "PaaS",
    "free SSL",
    "unlimited domains",
    "CLI deploy",
    "MCP server",
    "instant rollback",
    "git push deploy",
    "docker deploy",
    "self host",
    "VPS deploy",
    "developer tools",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: TITLE_DEFAULT,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Vibrail — Ship Software on Your Infrastructure",
    description:
      "Deploy to Vibrail Cloud or Linux VPS infrastructure with immutable releases, managed routing, and instant rollbacks.",
    creator: "@vibrail",
    site: "@vibrail",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  // verification: {
  //   google: "<google-site-verification-token>",
  //   yandex: "<yandex-verification-token>",
  //   other: { "msvalidate.01": "<bing-verification-token>" },
  // },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0F0F0F" },
    { media: "(prefers-color-scheme: dark)", color: "#0F0F0F" },
  ],
  colorScheme: "dark",
};

const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/android-chrome-512x512.png`,
  description: DESCRIPTION,
  sameAs: [
    "https://x.com/vibrailio",
    "https://discord.gg/UD5YFsZz7W",
  ],
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "hello@vibrail.com",
      availableLanguage: ["English"],
    },
  ],
};

const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  inLanguage: "en-US",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://cdn.oblien.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.oblien.com" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }}
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
