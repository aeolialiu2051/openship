/** Docker normally abbreviates container IDs to 12 characters in list output.
 * Deployment rows, however, persist the full ID returned by `docker run`.
 * Prefer an exact match, then accept a unique Docker-length prefix match so a
 * remote daemon or CLI wrapper that still truncates IDs cannot make a running
 * service look stopped. Never guess when a prefix is ambiguous. */
export function findContainerByTrackedId<T extends { containerId: string }>(
  containers: readonly T[],
  trackedContainerId: string,
): T | undefined {
  const exact = containers.find((container) => container.containerId === trackedContainerId);
  if (exact) return exact;

  const prefixMatches = containers.filter((container) => {
    const observedId = container.containerId;
    const shorterLength = Math.min(observedId.length, trackedContainerId.length);
    if (shorterLength < 12) return false;
    return observedId.startsWith(trackedContainerId) || trackedContainerId.startsWith(observedId);
  });

  return prefixMatches.length === 1 ? prefixMatches[0] : undefined;
}
