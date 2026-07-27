import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";
import { tmpdir } from "node:os";
import { STARTER_TEMPLATES, hasStarterTemplate } from "@repo/core";

const materializing = new Map<string, Promise<string>>();

/** Materialize a trusted built-in starter into a deterministic API-local cache.
 * Build runtimes already know how to transfer `localPath` into local, SSH and
 * cloud workspaces, so templates need no special workspace provisioning path. */
export function materializeStarterTemplate(stackId: string): Promise<string> {
  const existing = materializing.get(stackId);
  if (existing) return existing;

  const task = (async () => {
    if (!hasStarterTemplate(stackId)) {
      throw new Error(`Built-in starter "${stackId}" is not available`);
    }

    const starter = STARTER_TEMPLATES[stackId];
    const digest = createHash("sha256")
      .update(JSON.stringify(starter.files))
      .digest("hex")
      .slice(0, 16);
    const base = join(tmpdir(), "openship-template-sources");
    const root = join(base, `${stackId}-${digest}`);
    const marker = join(base, `.${stackId}-${digest}.ready`);
    if ((await stat(marker).catch(() => null))?.isFile()) return root;

    await mkdir(root, { recursive: true });
    for (const [relativePath, content] of Object.entries(starter.files)) {
      const safePath = normalize(relativePath);
      if (
        !safePath ||
        safePath === "." ||
        isAbsolute(safePath) ||
        safePath === ".." ||
        safePath.startsWith(`..${sep}`)
      ) {
        throw new Error(`Unsafe built-in starter path: ${relativePath}`);
      }
      const target = join(root, safePath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }
    await writeFile(marker, `${stackId}:${digest}\n`, "utf8");
    return root;
  })();

  materializing.set(stackId, task);
  task.catch(() => materializing.delete(stackId));
  return task;
}
