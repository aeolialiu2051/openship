/**
 * Resolve the routing shape of the deployment being preflighted.
 *
 * `snapshot.hasServer` describes the project-level app. It is deliberately not
 * authoritative once the service pipeline is selected: Compose/monorepo
 * services are deployed as container workloads and their public endpoints
 * route to ports even when the original project was detected as static.
 */
export function usesServerEndpointRouting(input: {
  hasServer: boolean;
  multiService?: boolean;
}): boolean {
  return input.multiService === true || input.hasServer;
}
