import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { readSecretFromStdin } from "../../src/commands/project";

describe("readSecretFromStdin", () => {
  it("reads a generated secret and removes one trailing line ending", async () => {
    await expect(readSecretFromStdin(Readable.from(["abc123\n"]))).resolves.toBe("abc123");
    await expect(readSecretFromStdin(Readable.from(["abc123\r\n"]))).resolves.toBe("abc123");
  });

  it("preserves whitespace that is part of the secret", async () => {
    await expect(readSecretFromStdin(Readable.from(["  abc123  \n"]))).resolves.toBe("  abc123  ");
  });

  it("rejects empty, NUL-containing, and oversized input", async () => {
    await expect(readSecretFromStdin(Readable.from(["\n"]))).rejects.toThrow("empty");
    await expect(readSecretFromStdin(Readable.from(["abc\0def"]))).rejects.toThrow("NUL");
    await expect(readSecretFromStdin(Readable.from(["x".repeat(10_001)]))).rejects.toThrow(
      "exceeds 10000 bytes",
    );
  });
});
