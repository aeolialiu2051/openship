/** Convert an ISO-3166 alpha-2 code into its Unicode flag sequence. */
export function countryCodeToFlagEmoji(code: string | null | undefined): string | null {
  const normalized = code?.trim().toUpperCase();
  if (!normalized || !/^[A-Z]{2}$/.test(normalized)) return null;
  const offset = 0x1f1e6 - 65;
  return String.fromCodePoint(
    normalized.charCodeAt(0) + offset,
    normalized.charCodeAt(1) + offset,
  );
}
