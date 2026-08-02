import { describe, expect, it } from "vitest";

import { assetUrl, RELEASES, REPO } from "../../src/lib/github-releases";

describe("github-releases constants", () => {
  it("points at the aeolialiu2051/vibrail releases page", () => {
    expect(REPO).toBe("aeolialiu2051/vibrail");
    expect(RELEASES).toBe("https://github.com/aeolialiu2051/vibrail/releases");
  });
});

describe("assetUrl", () => {
  it("builds a release download URL from a tag + asset name", () => {
    expect(assetUrl("v1.2.3", "Vibrail-arm64.dmg")).toBe(
      "https://github.com/aeolialiu2051/vibrail/releases/download/v1.2.3/Vibrail-arm64.dmg",
    );
  });
});
