import { describe, expect, it } from "vitest";
import { shouldLoadDictionary } from "../i18n/dictionary-loading";
import { getUiDirection, isRtl } from "../i18n/config";

describe("shouldLoadDictionary", () => {
  it("does not reload the dictionary already injected by SSR", () => {
    expect(shouldLoadDictionary("en", "en")).toBe(false);
    expect(shouldLoadDictionary("zh", "zh")).toBe(false);
  });

  it("loads after a real runtime locale change", () => {
    expect(shouldLoadDictionary("zh", "en")).toBe(true);
    expect(shouldLoadDictionary("en", "ar")).toBe(true);
  });
});

describe("locale direction", () => {
  it("keeps the dashboard layout stable while preserving Arabic text direction", () => {
    expect(isRtl("ar")).toBe(true);
    expect(getUiDirection("ar")).toBe("ltr");
    expect(getUiDirection("en")).toBe("ltr");
  });
});
