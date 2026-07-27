import { describe, expect, it } from "vitest";

import {
  SOURCE_PROVIDERS,
  isReleaseProvider,
  isTemplateProvider,
  renderAssetName,
} from "../src/project-source";

describe("isReleaseProvider", () => {
  it("is true only for the exact 'release' provider", () => {
    expect(isReleaseProvider("release")).toBe(true);
    expect(isReleaseProvider("github")).toBe(false);
    expect(isReleaseProvider("local")).toBe(false);
    expect(isReleaseProvider("upload")).toBe(false);
    expect(isReleaseProvider(null)).toBe(false);
    expect(isReleaseProvider(undefined)).toBe(false);
    expect(isReleaseProvider("")).toBe(false);
  });

  it("release is a member of SOURCE_PROVIDERS", () => {
    expect(SOURCE_PROVIDERS).toContain("release");
  });
});

describe("isTemplateProvider", () => {
  it("recognizes only the built-in template source", () => {
    expect(isTemplateProvider("template")).toBe(true);
    expect(isTemplateProvider("upload")).toBe(false);
    expect(isTemplateProvider("github")).toBe(false);
    expect(isTemplateProvider(null)).toBe(false);
    expect(SOURCE_PROVIDERS).toContain("template");
  });
});

describe("renderAssetName", () => {
  it("substitutes {tag}/{version}/{os}/{arch}", () => {
    expect(
      renderAssetName("openship-{tag}-{os}-{arch}.tar.gz", {
        version: "1.2.3",
        os: "darwin",
        arch: "arm64",
      }),
    ).toBe("openship-v1.2.3-darwin-arm64.tar.gz");
  });

  it("defaults os→linux and arch→amd64", () => {
    expect(renderAssetName("app-{os}-{arch}.tgz", { version: "0.4.0" })).toBe(
      "app-linux-amd64.tgz",
    );
  });

  it("tolerates a leading 'v' on the version (tag stays single-v, version strips it)", () => {
    expect(renderAssetName("{tag}|{version}", { version: "v2.0.0" })).toBe("v2.0.0|2.0.0");
  });

  it("replaces every occurrence of a placeholder", () => {
    expect(renderAssetName("{version}/{version}", { version: "9.9.9" })).toBe("9.9.9/9.9.9");
  });
});
