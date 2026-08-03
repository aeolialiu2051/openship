import { VibrailLanding } from "@/components/landing/vibrail-landing";

const SITE_URL = "https://vibrail.warpgateapi.com";

const softwareLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Vibrail",
  applicationCategory: "DeveloperApplication",
  applicationSubCategory: "Deployment Platform",
  operatingSystem: "macOS, Windows, Linux, Web",
  url: SITE_URL,
  description: "Deployment infrastructure that turns human- and agent-created code into reliable services on Vibrail Cloud or Linux VPS environments.",
  offers: { "@type": "Offer", category: "Cloud and VPS deployment" },
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd) }} />
      <VibrailLanding />
    </>
  );
}
