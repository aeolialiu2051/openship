const configuredSiteDomain = process.env.VIBRAIL_SITE_DOMAIN?.trim() || "vibrail.com";

/** Canonical public site URL derived from VIBRAIL_SITE_DOMAIN. */
export const SITE_URL = (
  /^[a-z][a-z\d+.-]*:\/\//i.test(configuredSiteDomain)
    ? configuredSiteDomain
    : `https://${configuredSiteDomain}`
).replace(/\/+$/, "");
