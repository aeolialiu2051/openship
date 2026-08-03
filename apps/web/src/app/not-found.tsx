import { VibrailNotFound } from "@/components/landing/vibrail-not-found";
// apps/web has multiple root layouts (one per route group), so a global
// not-found renders WITHOUT any of them — it must supply its own document
// shell + styles, then compose the marketing chrome like the legal pages do.
import "./globals.css";

export default function NotFound() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Page not found — Vibrail</title>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="min-h-screen antialiased">
        <VibrailNotFound />
      </body>
    </html>
  );
}
