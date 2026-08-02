#!/usr/bin/env node

import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
copyFileSync(join(cliRoot, "..", "..", "LICENSE"), join(cliRoot, "LICENSE"));
