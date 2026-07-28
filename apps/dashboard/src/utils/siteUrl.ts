/**
 * Build a clickable site URL from either a hostname or an absolute HTTP(S) URL.
 */
export function getSiteUrl(domain: string): string {
  const value = domain.trim();

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value.replace(/^\/+/, "")}`;
}
