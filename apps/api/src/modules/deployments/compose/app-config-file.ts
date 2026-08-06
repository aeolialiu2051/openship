import type { CommandExecutor } from "@repo/adapters";

type AppConfigFile = {
  path: string;
  content: string;
  writable?: boolean;
};

/** Compatibility for installs created before writable app files were modeled. */
export function isWritableAppConfig(
  appTemplateId: string | null | undefined,
  file: Pick<AppConfigFile, "path" | "writable">,
): boolean {
  return (
    file.writable === true ||
    (appTemplateId === "cli-proxy-api" && file.path === "/CLIProxyAPI/config.yaml")
  );
}

/** Materialize one generated app config and return its Docker bind spec. */
export async function prepareAppConfigMount(
  executor: CommandExecutor,
  hostPath: string,
  file: AppConfigFile,
): Promise<string> {
  if (!file.writable || !(await executor.exists(hostPath))) {
    await executor.writeFile(hostPath, file.content);
  }

  return `${hostPath}:${file.path}:${file.writable ? "rw" : "ro"}`;
}
