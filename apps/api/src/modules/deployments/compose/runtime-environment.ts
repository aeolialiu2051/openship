import { interpolateComposeString } from "../../../lib/compose-parser";

/**
 * Resolve Compose environment placeholders at deployment time.
 *
 * Repository scanning cannot know hosted secrets, so `${KEY}` expressions may
 * reach the service table unresolved (especially through API/CLI sync). Resolve
 * them against the decrypted deployment environment before starting Docker.
 * Service-scoped values win, but ordinary literal Compose values still override
 * shared project defaults just like Docker Compose.
 */
export function resolveComposeRuntimeEnvironment(input: {
  project: Record<string, string>;
  deployment: Record<string, string>;
  compose: Record<string, string>;
  service: Record<string, string>;
}): Record<string, string> {
  const shared = { ...input.project, ...input.deployment };
  const interpolationEnv = { ...shared, ...input.service };
  const resolvedCompose = Object.fromEntries(
    Object.entries(input.compose).map(([key, value]) => [
      key,
      interpolateComposeString(value, interpolationEnv, "collect"),
    ]),
  );

  return {
    ...shared,
    ...resolvedCompose,
    ...input.service,
  };
}
