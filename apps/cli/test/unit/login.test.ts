import { describe, expect, it } from "vitest";
import { tokenSettingsUrl } from "../../src/commands/login";

describe("tokenSettingsUrl", () => {
  it("opens the Personal Access Tokens settings tab", () => {
    expect(tokenSettingsUrl("https://vibrail.warpgateapi.com")).toBe(
      "https://vibrail.warpgateapi.com/settings?tab=tokens",
    );
  });

  it("does not introduce a double slash", () => {
    expect(tokenSettingsUrl("https://vibrail.example.com/")).toBe(
      "https://vibrail.example.com/settings?tab=tokens",
    );
  });
});
