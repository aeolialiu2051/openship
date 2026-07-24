import type { FrameworkId } from "@/components/import-project/types";
import { getBuildImage, LANGUAGES, STACKS, type StackDefinition, type StackId } from "@repo/core";
import type { DeploymentConfig } from "./types";

/**
 * Apply the runtime defaults for a framework the operator selected manually.
 * Detection remains informational; only the active deployment configuration
 * changes here.
 */
export function getFrameworkSelectionUpdates(
  config: DeploymentConfig,
  frameworkId: FrameworkId,
): Partial<DeploymentConfig> {
  const stackDef = STACKS[frameworkId as StackId] as StackDefinition | undefined;
  if (!stackDef) return { framework: frameworkId };

  const supportedPackageManagers = LANGUAGES[stackDef.language]
    .packageManagers as readonly string[];
  const packageManager = supportedPackageManagers.includes(config.packageManager)
    ? config.packageManager
    : (supportedPackageManagers[0] ?? config.packageManager);
  const isStatic =
    stackDef.category === "static" ||
    (stackDef.category === "frontend" && !stackDef.defaultStartCommand);
  const hasBuild =
    Boolean(stackDef.defaultBuildCommand) || (isStatic && stackDef.outputDirectory !== ".");

  return {
    framework: frameworkId,
    packageManager,
    buildImage: getBuildImage(frameworkId as StackId, packageManager),
    options: {
      ...config.options,
      buildCommand: stackDef.defaultBuildCommand,
      installCommand: "",
      outputDirectory: stackDef.outputDirectory,
      productionPaths: stackDef.productionPaths?.join(", ") ?? "",
      startCommand: stackDef.defaultStartCommand,
      productionPort: isStatic ? "" : String(stackDef.defaultPort),
      hasServer: !isStatic,
      hasBuild,
    },
  };
}
