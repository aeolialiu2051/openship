-- Move previously generated managed/free project routes onto the Vibrail zone.
-- Custom domains are intentionally untouched.
UPDATE "domain"
SET
  "hostname" = regexp_replace(
    "hostname",
    '\.opsh\.io$',
    '.vibrail.com'
  ),
  "updated_at" = now()
WHERE
  "domain_type" = 'free'
  AND "hostname" ~ '\.opsh\.io$';
