/**
 * A credential is mandatory only when the source clone itself runs on a remote
 * bare worker. Docker/Compose builds can clone anonymously on the server, or
 * fall back to cloning on the API host and transferring the build context.
 */
export function requiresRemoteCloneCredential(input: {
  needsClone: boolean;
  repoIsPublic: boolean;
  runtimeIsBare: boolean;
  hasServer: boolean;
  effectiveTarget: string;
  buildStrategy?: "local" | "server";
}): boolean {
  return (
    input.needsClone &&
    !input.repoIsPublic &&
    input.runtimeIsBare &&
    input.hasServer &&
    input.effectiveTarget === "server" &&
    input.buildStrategy !== "local"
  );
}
