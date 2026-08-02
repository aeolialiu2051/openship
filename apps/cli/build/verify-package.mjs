#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const failures = [];

function requireValue(ok, message) {
  if (!ok) failures.push(message);
}

requireValue(pkg.name === "@vibrail/cli", `package name must be @vibrail/cli (got ${pkg.name})`);
requireValue(pkg.private !== true, "package must not be private");
requireValue(pkg.bin?.vibrail === "./dist/index.js", "bin.vibrail must point to ./dist/index.js");
requireValue(pkg.publishConfig?.access === "public", "publishConfig.access must be public");
requireValue(pkg.engines?.node === ">=22.0.0", "engines.node must match the supported Node baseline");

for (const section of ["dependencies", "optionalDependencies", "peerDependencies"]) {
  for (const [name, spec] of Object.entries(pkg[section] ?? {})) {
    requireValue(!String(spec).startsWith("workspace:"), `${section}.${name} must not use workspace:*`);
    requireValue(!name.startsWith("@repo/"), `${section}.${name} is private and must be bundled instead`);
  }
}

const entry = join(root, "dist/index.js");
const server = join(root, "dist/server/index.js");
const pgliteWasm = join(root, "dist/server/pglite/pglite.wasm");
const migrations = join(root, "dist/server/migrations/meta/_journal.json");

for (const path of [
  entry,
  server,
  pgliteWasm,
  migrations,
  join(root, "README.md"),
  join(root, "LICENSE"),
]) {
  requireValue(existsSync(path), `missing publish artifact: ${path}`);
}

if (existsSync(entry)) {
  const source = readFileSync(entry, "utf8");
  requireValue(source.startsWith("#!/usr/bin/env node\n"), "dist/index.js must retain the Node executable shebang");
  requireValue(source.includes(pkg.version), `dist/index.js does not contain package version ${pkg.version}`);
  requireValue(!source.includes('from "@repo/'), "dist/index.js contains an unresolved @repo import");
}

if (existsSync(server)) {
  requireValue(statSync(server).size > 1_000_000, "bundled server is unexpectedly small");
  const source = readFileSync(server, "utf8");
  requireValue(!source.includes('from "@repo/'), "bundled server contains an unresolved @repo import");
}

if (existsSync(entry) && failures.length === 0) {
  for (const args of [["--version"], ["--help"]]) {
    const run = spawnSync(process.execPath, [entry, ...args], { encoding: "utf8" });
    requireValue(run.status === 0, `built CLI failed for ${args.join(" ")}: ${run.stderr.trim()}`);
  }
}

if (failures.length > 0) {
  console.error("npm package verification failed:\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`@vibrail/cli@${pkg.version} package artifacts verified`);
