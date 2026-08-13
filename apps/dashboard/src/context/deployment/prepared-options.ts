import type { PrepareProjectResponse } from "@/lib/api/deploy";
import type { DeploymentConfig } from "./types";

export function buildPreparedOptions(response: PrepareProjectResponse): DeploymentConfig["options"] {
  // Declared productionMode wins. Compose projects run through their service
  // processes, so an empty project-level startCommand does not make them static.
  const hasServer = response.productionMode
    ? response.productionMode !== "static"
    : response.projectType === "services" || !!response.startCommand;

  return {
    buildCommand: response.buildCommand ?? "",
    installCommand: response.installCommand ?? "",
    outputDirectory: response.outputDirectory ?? "",
    productionPaths: response.productionPaths.join(", "),
    startCommand: response.startCommand ?? "",
    productionPort: hasServer ? String(response.port ?? "") : "",
    rootDirectory: response.rootDirectory || "./",
    hasServer,
    hasBuild: !!response.buildCommand,
  };
}
