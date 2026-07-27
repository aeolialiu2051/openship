/** The Cloud destination can be previewed, but starting an app install there is not live yet. */
export const APP_CLOUD_INSTALL_AVAILABLE = false;

/**
 * The `local` deploy target means the user's desktop/dev machine. A server-hosted
 * Openship instance exposes its own host through the server list instead, so
 * showing a second "This machine" choice there would duplicate the same host
 * with different deployment semantics.
 */
export function canUseLocalAppDestination({
  allowLocal,
  deployMode,
}: {
  allowLocal: boolean;
  deployMode: string;
}): boolean {
  return allowLocal && deployMode === "desktop";
}
