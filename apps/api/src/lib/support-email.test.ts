import { describe, expect, it } from "vitest";
import { extractSupportEmail } from "./support-email";

describe("extractSupportEmail", () => {
  it("extracts the mailbox from SMTP_FROM display-name syntax", () => {
    expect(extractSupportEmail("Vibrail <support@vibrail.com>"))
      .toBe("support@vibrail.com");
  });

  it("accepts a bare mailbox and rejects an empty value", () => {
    expect(extractSupportEmail("support@example.com")).toBe("support@example.com");
    expect(extractSupportEmail(undefined)).toBe("");
  });
});
