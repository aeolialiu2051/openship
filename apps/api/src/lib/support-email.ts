import { env } from "../config";

/** Extract the mailbox from a From value such as `Vibrail <support@example.com>`. */
export function extractSupportEmail(from: string | undefined): string {
  const value = from?.trim() || "";
  const bracketed = /<\s*([^<>\s]+@[^<>\s]+)\s*>/.exec(value)?.[1];
  if (bracketed) return bracketed;
  return /\b[^\s<>@]+@[^\s<>@]+\b/.exec(value)?.[0] || "";
}

export function getSupportEmail(): string {
  return extractSupportEmail(env.SMTP_FROM);
}
