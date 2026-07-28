"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";

/** Record one authenticated dashboard page view per client-side route change. */
export function PageViewTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === lastPath.current) return;
    lastPath.current = pathname;
    void api
      .post(
        "telemetry/page-view",
        {
          path: pathname,
          referrer: typeof document !== "undefined" ? document.referrer : undefined,
        },
        { timeout: 5_000 },
      )
      .catch(() => {});
  }, [pathname]);

  return null;
}
