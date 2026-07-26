import { describe, expect, it } from "vitest";
import { countryCodeToFlagEmoji } from "./country-flag";

describe("countryCodeToFlagEmoji", () => {
  it("converts ISO alpha-2 codes without shipping a flag component catalog", () => {
    expect(countryCodeToFlagEmoji("us")).toBe("🇺🇸");
    expect(countryCodeToFlagEmoji("CN")).toBe("🇨🇳");
  });

  it("rejects missing or malformed values", () => {
    expect(countryCodeToFlagEmoji(null)).toBeNull();
    expect(countryCodeToFlagEmoji("USA")).toBeNull();
  });
});
