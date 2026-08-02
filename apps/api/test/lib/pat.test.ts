import { describe, expect, test } from "bun:test";
import { isPatToken } from "../../src/lib/bearer";
import { hashPatToken, mintPatToken, PAT_PREFIX } from "../../src/lib/pat";

describe("personal access token branding", () => {
  test("new tokens use the Vibrail prefix", () => {
    const minted = mintPatToken();

    expect(minted.token).toStartWith(PAT_PREFIX);
    expect(minted.token).toStartWith("vibrail_pat_");
    expect(minted.tokenPrefix).toBe(minted.token.slice(0, PAT_PREFIX.length + 6));
    expect(minted.tokenHash).toBe(hashPatToken(minted.token));
  });

  test("recognizes current and legacy PAT prefixes", () => {
    expect(isPatToken("vibrail_pat_current-token")).toBe(true);
    expect(isPatToken("opsh_pat_legacy-token")).toBe(true);
    expect(isPatToken("openship_pat_invalid-token")).toBe(false);
    expect(isPatToken(null)).toBe(false);
  });
});
