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

type HeaderReader = { get(name: string): string | null };

/**
 * Return false when a response explicitly prevents cross-origin framing.
 * Collection cards are hosted outside each project's `.vibrail.app` origin,
 * so SAMEORIGIN and CSP `self` cannot render here either.
 */
export function allowsCollectionEmbedding(headers: HeaderReader) {
  const xFrameOptions = headers.get("x-frame-options")?.trim().toLowerCase();
  if (xFrameOptions) {
    const directives = xFrameOptions.split(",").map((value) => value.trim());
    if (directives.some((value) => value === "deny" || value === "sameorigin")) {
      return false;
    }
  }

  const csp = headers.get("content-security-policy") ?? "";
  const frameAncestors = csp
    .split(";")
    .map((directive) => directive.trim())
    .find((directive) => /^frame-ancestors(?:\s|$)/i.test(directive));
  if (!frameAncestors) return true;

  const sources = frameAncestors.replace(/^frame-ancestors\s*/i, "").trim().split(/\s+/);
  if (sources.includes("'none'")) return false;
  // A project origin is never the Collection origin, so a self-only policy
  // blocks the card even though the project itself renders normally.
  if (sources.length === 1 && sources[0] === "'self'") return false;
  return true;
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

    if (!allowsCollectionEmbedding(response.headers)) return false;

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
