import { describe, expect, it } from "vitest";
import { webmailPublicEndpoints } from "./webmail-routing";

describe("webmail managed routing", () => {
  it("keeps the six-character project route key when a custom domain is present", () => {
    expect(
      webmailPublicEndpoints(
        { slug: "webmail-ext-mail-vibrail-com-a87385c4", routeKey: "4gssqa" },
        4080,
        "Mail.Vibrail.com",
      ),
    ).toEqual([
      {
        port: 4080,
        domain: "webmail-ext-mail-vibrail-com-a87385c4-4gssqa",
        domainType: "free",
      },
      {
        port: 4080,
        customDomain: "mail.vibrail.com",
        domainType: "custom",
      },
    ]);
  });

  it("still creates the managed route for the mail-server proxy variant", () => {
    expect(
      webmailPublicEndpoints({ slug: "webmail-server-1", routeKey: "00ab9z" }, 4080),
    ).toEqual([
      {
        port: 4080,
        domain: "webmail-server-1-00ab9z",
        domainType: "free",
      },
    ]);
  });

  it("uses the route label reserved by the install form", () => {
    expect(
      webmailPublicEndpoints(
        { slug: "internal-project-slug", routeKey: "4gssqa" },
        4080,
        undefined,
        "inbox-4gssqa",
      ),
    ).toEqual([{ port: 4080, domain: "inbox-4gssqa", domainType: "free" }]);
  });
});
