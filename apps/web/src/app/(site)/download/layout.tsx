import type { Metadata } from "next";
import type { ReactNode } from "react";

const TITLE = "Download";
const DESCRIPTION =
  "Install Vibrail on macOS, Windows, Linux, or grab the CLI. Native desktop app and command-line - same backend, same deploys, your choice of surface.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/download" },
  keywords: [
    "vibrail download",
    "vibrail CLI",
    "vibrail desktop",
    "deploy CLI",
    "macOS deploy tool",
    "Windows deploy tool",
    "Linux deploy tool",
    "self host CLI",
  ],
  openGraph: {
    title: `${TITLE} - Vibrail`,
    description: DESCRIPTION,
    url: "/download",
    type: "website",
    siteName: "Vibrail",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} - Vibrail`,
    description: DESCRIPTION,
  },
};

const softwareLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Vibrail",
  applicationCategory: "DeveloperApplication",
  applicationSubCategory: "Deployment Platform",
  operatingSystem: "macOS, Windows, Linux",
  url: "https://vibrail.warpgateapi.com/download",
  downloadUrl: "https://vibrail.warpgateapi.com/download",
  softwareVersion: "latest",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  publisher: {
    "@type": "Organization",
    name: "Vibrail",
    url: "https://vibrail.warpgateapi.com",
  },
  description: DESCRIPTION,
  license: "https://www.apache.org/licenses/LICENSE-2.0",
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://vibrail.warpgateapi.com" },
    { "@type": "ListItem", position: 2, name: "Download", item: "https://vibrail.warpgateapi.com/download" },
  ],
};

export default function DownloadLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {children}
    </>
  );
}
