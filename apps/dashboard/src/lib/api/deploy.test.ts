import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("./client", () => ({
  api: {
    get: vi.fn(),
    post,
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { deployApi, REPOSITORY_PREPARE_TIMEOUT_MS } from "./deploy";
import { endpoints } from "./endpoints";

describe("deployApi.prepare", () => {
  beforeEach(() => {
    post.mockReset();
  });

  it("allows enough time to inspect large repositories", () => {
    const body = { owner: "openclaw", repo: "openclaw" };

    deployApi.prepare(body);

    expect(REPOSITORY_PREPARE_TIMEOUT_MS).toBe(60_000);
    expect(post).toHaveBeenCalledWith(endpoints.deploy.prepare, body, {
      timeout: 60_000,
    });
  });
});
