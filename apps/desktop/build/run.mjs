/**
 * Launch the packaged desktop app built by `make` (out/Vibrail-<platform>-<arch>/)
 * ATTACHED to this terminal, so its logs stream here and Ctrl-C quits it.
 * Run `bun run build:desktop` first if there's no build.
 */

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");

function fail(msg) {
  console.error(`${msg}\nBuild it first:  bun run build:desktop`);
  process.exit(1);
}

if (!existsSync(OUT)) fail("No desktop build found.");

// Packaged output dir is named "Vibrail-<platform>-<arch>".
const dir = readdirSync(OUT).find(
  (d) => d.startsWith("Vibrail-") && d.includes(process.platform),
);
if (!dir) fail(`No packaged app for ${process.platform} in out/.`);
const base = join(OUT, dir);

let bin;
if (process.platform === "darwin") {
  bin = join(base, "Vibrail.app", "Contents", "MacOS", "vibrail");
} else if (process.platform === "win32") {
  bin = join(base, "vibrail.exe");
} else {
  bin = join(base, "vibrail");
}
if (!existsSync(bin)) fail(`Missing ${bin}.`);

console.log(`▸ Launching ${bin}\n  logs stream below — Ctrl-C to quit\n`);
// stdio:"inherit" keeps the app attached so [api]/[dashboard] logs show here.
const child = spawn(bin, [], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
