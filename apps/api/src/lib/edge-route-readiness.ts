const EDGE_PROPAGATION_TIMEOUT_MS = 60_000;
const EDGE_PROPAGATION_POLL_MS = 1_000;

export async function waitForManagedRoutePropagation(
  hostname: string,
  version: number,
  options: { fetch?: typeof fetch; timeoutMs?: number; pollMs?: number } = {},
): Promise<boolean> {
  const request = options.fetch ?? fetch;
  const deadline = Date.now() + (options.timeoutMs ?? EDGE_PROPAGATION_TIMEOUT_MS);
  const pollMs = options.pollMs ?? EDGE_PROPAGATION_POLL_MS;
  do {
    try {
      const response = await request(`https://${hostname}/?__vibrail_route_probe=${version}`, {
        method: "GET",
        redirect: "manual",
        headers: { "cache-control": "no-cache" },
      });
      if (
        response.headers.get("x-vibrail-route-status") === "hit" &&
        response.headers.get("x-vibrail-route-version") === String(version)
      ) return true;
    } catch {
      // KV and edge-cache propagation is eventually consistent; retry until
      // the bounded deadline instead of exposing a transient dead URL.
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  } while (true);
  return false;
}
