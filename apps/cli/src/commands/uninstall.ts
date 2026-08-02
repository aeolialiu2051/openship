/**
 * `vibrail uninstall` — remove Vibrail from this machine.
 *
 * The counterpart to `vibrail up`. Where `stop` just halts things (compose down /
 * unload the service, keeping data), uninstall is the DESTRUCTIVE version: it also
 * drops the stack's volumes and database, deletes
 * the images we own, and removes ~/.vibrail.
 *
 * Two things it deliberately does NOT do, because this box is usually shared with
 * the operator's own workloads:
 *   • never prunes images/volumes broadly — only our three images, by exact tag,
 *     and only this project's volumes via `down -v`.
 *   • never deletes DEPLOYED app containers/volumes. Those are the user's
 *     workloads; removing the control plane shouldn't take their apps down with it
 *     (that's what project deletion is for).
 *
 */
import { Command } from "commander";
import chalk from "chalk";
import { confirm, isCancel } from "@clack/prompts";
import { existsSync, rmSync } from "node:fs";

import { stop as stopService } from "../lib/service";
import { readInstallMethod, composeUninstall } from "../lib/compose";
import { OS_DIR } from "../lib/paths";

export const uninstallCommand = new Command("uninstall")
  .description(
    "Remove Vibrail from this machine: stop it, delete its data and images, and remove ~/.vibrail. Deployed apps are left running.",
  )
  .option("-y, --yes", "Skip the confirmation prompt (for scripts)")
  .option("--keep-data", "Keep the database/certs volumes and ~/.vibrail — remove only the running stack")
  .option("--keep-images", "Don't delete the Vibrail container images")
  .action(async (opts: { yes?: boolean; keepData?: boolean; keepImages?: boolean }) => {
    const method = readInstallMethod();
    const destructive = !opts.keepData;

    if (!opts.yes) {
      const lines = [
        method === "compose"
          ? "  • stop the Docker Compose stack (api, dashboard, postgres, redis)"
          : "  • stop and remove the Vibrail service",
        destructive ? "  • DELETE its database and local state" : null,
        destructive ? `  • DELETE ${OS_DIR} (config, tokens, local database)` : null,
        !opts.keepImages && method === "compose" ? "  • delete the Vibrail container images" : null,
        "  • leave your DEPLOYED apps and their data untouched",
      ].filter(Boolean);
      console.log(chalk.yellow("\n  This will:\n") + lines.join("\n") + "\n");
      const go = await confirm({
        message: destructive ? "Permanently remove Vibrail and its data?" : "Remove Vibrail (keeping data)?",
        initialValue: false,
      });
      if (isCancel(go) || !go) {
        console.log(chalk.dim("\n  Cancelled — nothing was changed.\n"));
        return;
      }
    }

    if (method === "compose") {
      const { ok, removedImages } = composeUninstall({ removeImages: !opts.keepImages });
      if (!ok) {
        console.log(
          chalk.yellow("  No compose stack found (or `down` failed) — continuing with local cleanup."),
        );
      } else {
        console.log(
          chalk.green(`  Stack removed${destructive ? " (including its volumes)" : ""}.`),
        );
      }
      for (const ref of removedImages) console.log(chalk.dim(`  removed image ${ref}`));
    } else {
      try {
        const res = stopService();
        console.log(chalk.green(`  Service removed — ${res.detail}`));
      } catch (err) {
        console.log(chalk.yellow(`  Couldn't remove the service: ${(err as Error).message}`));
      }
    }

    if (destructive && existsSync(OS_DIR)) {
      try {
        rmSync(OS_DIR, { recursive: true, force: true });
        console.log(chalk.green(`  Removed ${OS_DIR}`));
      } catch (err) {
        console.log(chalk.yellow(`  Couldn't remove ${OS_DIR}: ${(err as Error).message}`));
      }
    }

    console.log(
      chalk.green("\n  ✔ Vibrail uninstalled.\n") +
        chalk.dim("  Deployed apps are still running — `docker ps` to review them.\n"),
    );
  });
