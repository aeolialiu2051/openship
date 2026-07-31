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

/**
 * A local build runs on the machine hosting the Openship API. That is a real,
 * operator-controlled build host in desktop and self-hosted modes. In cloud
 * mode it is the managed SaaS API host, so presenting it as "This machine" is
 * both misleading and unsupported.
 */
export function canUseLocalBuildLocation({ deployMode }: { deployMode: string }): boolean {
  return deployMode === "desktop" || deployMode === "docker" || deployMode === "bare";
}

/**
 * Runtime isolation is an operator-controlled host setting. Managed cloud mode
 * can deploy to a registered server, but it must not expose host-level
 * Docker/direct-runtime controls that the managed control plane does not own.
 */
export function canChooseServerRuntimeIsolation({ deployMode }: { deployMode: string }): boolean {
  return deployMode === "desktop" || deployMode === "docker" || deployMode === "bare";
}

/** A picker is useful only when the user has a real choice to make. */
export function hasBuildLocationChoice(optionCount: number): boolean {
  return optionCount > 1;
}
