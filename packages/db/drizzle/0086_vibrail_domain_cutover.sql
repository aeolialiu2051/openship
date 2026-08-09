-- Move existing Vibrail-managed free routes from the former production zone
-- to vibrail.com. Custom domains are intentionally untouched.
UPDATE "domain"
SET
  "hostname" = regexp_replace(
    "hostname",
    '\.vibrail\.warpgateapi\.com$',
    '.vibrail.com'
  ),
  "updated_at" = now()
WHERE
  "domain_type" = 'free'
  AND "hostname" ~ '\.vibrail\.warpgateapi\.com$';
