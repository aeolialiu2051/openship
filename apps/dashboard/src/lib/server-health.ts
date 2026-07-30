import { systemApi } from "@/lib/api";

/**
 * Component installation can deliberately refresh the pooled SSH connection
 * (for example after adding a user to the Docker group). The first check may
 * race that reconnect, so retry this read-only post-install verification a few
 * times before surfacing an error to the user.
 */
export async function checkServerAfterInstall(serverId: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await systemApi.checkServer(serverId);
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}
