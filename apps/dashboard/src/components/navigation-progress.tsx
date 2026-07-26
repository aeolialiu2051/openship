"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const COMPLETE_DELAY_MS = 180;
const SAFETY_TIMEOUT_MS = 10_000;

function isModifiedClick(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/** Whether an anchor click will trigger an in-app Next.js navigation. */
export function isInternalNavigationAnchor(
  anchor: HTMLAnchorElement,
  currentUrl: URL,
): boolean {
  if (
    anchor.target === "_blank" ||
    anchor.hasAttribute("download") ||
    anchor.getAttribute("rel")?.split(/\s+/).includes("external")
  ) {
    return false;
  }

  const rawHref = anchor.getAttribute("href");
  if (!rawHref || rawHref.startsWith("#")) return false;

  let targetUrl: URL;
  try {
    targetUrl = new URL(anchor.href, currentUrl);
  } catch {
    return false;
  }

  if (targetUrl.origin !== currentUrl.origin) return false;
  return `${targetUrl.pathname}${targetUrl.search}` !==
    `${currentUrl.pathname}${currentUrl.search}`;
}

/**
 * A global navigation indicator for App Router transitions.
 *
 * Next keeps the previous route visible while a dynamic RSC payload is in
 * flight. Without an immediate signal that looks like a frozen click. Capture
 * internal link clicks before navigation starts, then complete when pathname
 * changes. The safety timeout prevents a failed navigation from leaving the
 * indicator stuck forever.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    intervalRef.current = null;
    hideTimerRef.current = null;
    safetyTimerRef.current = null;
  }, []);

  const finish = useCallback(() => {
    if (!mountedRef.current) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setProgress(100);
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, COMPLETE_DELAY_MS);
  }, []);

  const start = useCallback(() => {
    clearTimers();
    setVisible(true);
    setProgress(12);
    intervalRef.current = setInterval(() => {
      setProgress((current) => {
        if (current >= 90) return current;
        const remaining = 90 - current;
        return current + Math.max(1, remaining * 0.12);
      });
    }, 160);
    safetyTimerRef.current = setTimeout(finish, SAFETY_TIMEOUT_MS);
  }, [clearTimers, finish]);

  useEffect(() => {
    mountedRef.current = true;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || isModifiedClick(event)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (isInternalNavigationAnchor(anchor, new URL(window.location.href))) start();
    };
    const onPopState = () => start();

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      clearTimers();
    };
  }, [clearTimers, start]);

  useEffect(() => {
    if (!mountedRef.current || !visible) return;
    finish();
    // A pathname change is the authoritative signal that the App Router
    // committed the next route. `visible` is deliberately omitted: including
    // it would complete immediately in the same render that starts progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100000] h-0.5 overflow-hidden"
    >
      <div
        className="h-full origin-left bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.55)] transition-transform duration-150 ease-out"
        style={{ transform: `scaleX(${progress / 100})` }}
      />
    </div>
  );
}
