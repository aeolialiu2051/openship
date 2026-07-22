import { describe, expect, it } from "vitest";
import { isProductTipAvailable, type ProductTip } from "./home-tips";

describe("product tip capabilities", () => {
  const serversTip: ProductTip = {
    id: "servers",
    href: "/servers",
    requires: "userServers",
  };
  const jobsTip: ProductTip = {
    id: "jobs",
    href: "/jobs",
    requires: "selfHosted",
  };

  it("shows user-owned VPS features on local SaaS", () => {
    const localSaas = { selfHosted: false, userServers: true };

    expect(isProductTipAvailable(serversTip, localSaas)).toBe(true);
    expect(isProductTipAvailable(jobsTip, localSaas)).toBe(false);
  });

  it("hides user-owned VPS features on production cloud SaaS", () => {
    const cloudSaas = { selfHosted: false, userServers: false };

    expect(isProductTipAvailable(serversTip, cloudSaas)).toBe(false);
  });
});
