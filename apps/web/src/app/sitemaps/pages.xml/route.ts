import { SITE_URL, buildUrlset, xmlResponse, type SitemapEntry } from "@/lib/sitemap-builder";

export const dynamic = "force-static";
export const revalidate = 3600;

export function GET() {
  const now = new Date();
  const entries: SitemapEntry[] = [
    { loc: `${SITE_URL}/`,         lastmod: now, changefreq: "daily",   priority: 1.0  },
  ];
  return xmlResponse(buildUrlset(entries));
}
