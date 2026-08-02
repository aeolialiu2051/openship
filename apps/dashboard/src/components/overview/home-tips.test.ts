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

  it("shows user-owned VPS features when the runtime enables them", () => {
    const vibrailSaas = { selfHosted: false, userServers: true };

    expect(isProductTipAvailable(serversTip, vibrailSaas)).toBe(true);
    expect(isProductTipAvailable(jobsTip, vibrailSaas)).toBe(false);
  });

  it("hides user-owned VPS features when the runtime disables them", () => {
    const cloudWithoutUserServers = { selfHosted: false, userServers: false };

    expect(isProductTipAvailable(serversTip, cloudWithoutUserServers)).toBe(false);
  });
});
