"use client";

import { useState } from "react";
import { Boxes, type LucideIcon } from "lucide-react";
import { APP_LOGO_OVERRIDES, resolveAppLogo } from "@repo/core";

/**
 * Per-app logo source. `src` wins (official logo URL); otherwise `slug` resolves
 * to a simpleicons brand mark. Convex uses its official favicon because the
 * simpleicons "convex" glyph renders as a red mask, not the real orange logo.
 */
export const APP_LOGO = APP_LOGO_OVERRIDES;

/**
 * Brand logo for a catalog app. Resolves an official URL / simpleicons mark and
 * gracefully falls back to a monochrome lucide icon (offline / air-gapped /
 * unknown app). Keeps the UI clean while adding a touch of real color.
 */
export function AppLogo({
  appId,
  slug,
  src,
  icon: Icon = Boxes,
  className = "size-5",
}: {
  appId?: string;
  slug?: string;
  src?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  // Resolve config by appId first, then by the bare slug — so callers that pass
  // only a `slug` (e.g. the migrate-sources brand row) can still pick up a
  // vendored src override for brands simpleicons doesn't carry.
  const cfg = resolveAppLogo(appId, slug);
  const resolvedSlug = slug ?? cfg?.slug;
  const url =
    src ?? cfg?.src ?? (resolvedSlug ? `https://cdn.simpleicons.org/${resolvedSlug}` : undefined);

  if (!url || failed) return <Icon className={`${className} text-muted-foreground`} />;
  // Full-bleed square marks (own background) fill the tile; transparent brand
  // glyphs stay at the requested size. Dark monochrome marks invert on the dark
  // themes so they don't vanish against a dark tile.
  // Full-bleed marks round to the tile they sit in (rounded-[inherit] takes the
  // parent tile's radius) so they don't render as a hard square.
  // Non-fill marks: object-contain so a non-square brand SVG fits the box without
  // squishing (square favicons/simpleicons are unaffected).
  const base = cfg?.fill
    ? "size-full object-cover rounded-[inherit]"
    : `${className} object-contain`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={24}
      height={24}
      loading="lazy"
      decoding="async"
      className={cfg?.darkInvert ? `${base} dark:invert dim:invert` : base}
      onError={() => setFailed(true)}
    />
  );
}
