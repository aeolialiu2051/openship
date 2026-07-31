import { describe, expect, it } from "vitest";
import { resolveFolderUploadTransport } from "../../../src/modules/projects/folder/upload-transport";

describe("resolveFolderUploadTransport", () => {
  it("uses the API relay for self-hosted instances", () => {
    expect(resolveFolderUploadTransport({
      cloudMode: false,
      nodeEnv: "production",
      hasOblienCredentials: false,
      hasServerTarget: false,
    })).toBe("api-relay");
  });

  it("uses the API relay for local SaaS development without Oblien credentials", () => {
    expect(resolveFolderUploadTransport({
      cloudMode: true,
      nodeEnv: "development",
      hasOblienCredentials: false,
      hasServerTarget: false,
    })).toBe("api-relay");
  });

  it("uses direct cloud upload when development credentials are configured", () => {
    expect(resolveFolderUploadTransport({
      cloudMode: true,
      nodeEnv: "development",
      hasOblienCredentials: true,
      hasServerTarget: false,
    })).toBe("oblien-direct");
  });

  it("keeps production cloud on the strict Oblien path", () => {
    expect(resolveFolderUploadTransport({
      cloudMode: true,
      nodeEnv: "production",
      hasOblienCredentials: false,
      hasServerTarget: false,
    })).toBe("oblien-direct");
  });

  it("uses the API relay for a user-selected server even in production cloud", () => {
    expect(resolveFolderUploadTransport({
      cloudMode: true,
      nodeEnv: "production",
      hasOblienCredentials: true,
      hasServerTarget: true,
    })).toBe("api-relay");
  });
});
