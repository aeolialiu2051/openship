import { hasVisualPreview } from "./frameworks";

const MANAGED_HOST_SUFFIX = ".vibrail.app";

function isManagedPreviewUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(MANAGED_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/**
 * A useful HTML response either contains visible body content or boots a
 * client-side application. Empty HTML shells from API/default routes should
 * use the branded Collection placeholder instead.
 */
export function hasRenderableHtml(html: string) {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const withoutNoise = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .trim();

  if (!withoutNoise) return false;
  if (/<script\b[^>]*\bsrc\s*=|<script\b[^>]*type=["']module["']/i.test(withoutNoise)) {
    return true;
  }

  const visibleText = withoutNoise.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, "").replace(/\s+/g, "").trim();
  if (visibleText.length > 0) return true;

  return /<(img|svg|canvas|video|iframe)\b/i.test(withoutNoise);
}

async function probeManagedHtml(url: string) {
  if (!isManagedPreviewUrl(url)) return false;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "text/html,application/xhtml+xml" },
      redirect: "manual",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return false;

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return false;
    }

    return hasRenderableHtml(await response.text());
  } catch {
    return false;
  }
}

export async function resolveCollectionPreview(project: {
  url: string;
  framework?: string | null;
}) {
  if (hasVisualPreview(project.framework)) return true;

  // Compose/Docker/unknown are ambiguous: inspect only platform-controlled
  // public hosts. Never turn Collection rendering into an arbitrary SSRF
  // primitive for user-supplied custom domains.
  return probeManagedHtml(project.url);
}
