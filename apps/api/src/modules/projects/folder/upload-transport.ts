export type FolderUploadTransport = "oblien-direct" | "api-relay";

/**
 * Production cloud must fail closed when its Oblien credentials are missing.
 * A local SaaS development process, however, can safely stage the upload on
 * its own API host and let the normal cloud build path transfer it later.
 */
export function resolveFolderUploadTransport(input: {
  cloudMode: boolean;
  nodeEnv: "development" | "production" | "test";
  hasOblienCredentials: boolean;
  hasServerTarget: boolean;
}): FolderUploadTransport {
  if (input.hasServerTarget) return "api-relay";
  if (!input.cloudMode) return "api-relay";
  if (input.nodeEnv !== "production" && !input.hasOblienCredentials) return "api-relay";
  return "oblien-direct";
}
