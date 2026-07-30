const SAFE_ROUTER_PART = /[^a-zA-Z0-9-]+/g;

function shortStableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(-7);
}

export function vibrailRouterName(...parts: Array<string | null | undefined>): string {
  const raw = parts.filter((part): part is string => !!part).join("-");
  const suffix = raw
    .replace(SAFE_ROUTER_PART, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const name = `vibrail-${suffix || "app"}`;
  if (name.length <= 63) return name;
  const hash = shortStableHash(raw);
  return `${name.slice(0, 63 - hash.length - 1).replace(/-+$/g, "")}-${hash}`;
}
