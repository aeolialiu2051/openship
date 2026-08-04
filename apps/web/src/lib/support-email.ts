const EMAIL_ADDRESS_PATTERN = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function getSupportEmail() {
  return process.env.SMTP_FROM?.match(EMAIL_ADDRESS_PATTERN)?.[0] ?? null;
}
