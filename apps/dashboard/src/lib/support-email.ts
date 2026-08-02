export function extractSupportEmail(from: string | undefined): string {
  const value = from?.trim() || "";
  const bracketed = /<\s*([^<>\s]+@[^<>\s]+)\s*>/.exec(value)?.[1];
  if (bracketed) return bracketed;
  return /\b[^\s<>@]+@[^\s<>@]+\b/.exec(value)?.[0] || "";
}

export function getSupportEmail(): string {
  if (typeof window !== "undefined") {
    return (window as { __VIBRAIL_SUPPORT_EMAIL__?: string }).__VIBRAIL_SUPPORT_EMAIL__ || "";
  }
  return extractSupportEmail(process.env.SMTP_FROM);
}
