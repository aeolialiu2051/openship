import { describe, expect, it } from "vitest";
import { ApiError } from "./client";
import { getLocalizedCustomDomainProjectLimitError } from "./custom-domain-project-limit-error";

const zhCopy = {
  projectLimitTitle: "其他项目正在使用自定义域名权益",
  projectLimitDescription:
    "Free 套餐只能有一个项目使用自定义域名。当前该权益已被 {project} 使用，升级到 Pro 后可在此项目使用自定义域名。",
};

describe("getLocalizedCustomDomainProjectLimitError", () => {
  it("uses the stable error code and structured project name", () => {
    const error = new ApiError(403, "Forbidden", {
      code: "CUSTOM_DOMAIN_PROJECT_LIMIT_REACHED",
      message: "Free accounts can use custom domains on only one project.",
      details: { claimedProjectName: "sub2api" },
    });

    expect(getLocalizedCustomDomainProjectLimitError(error, zhCopy)).toEqual({
      title: zhCopy.projectLimitTitle,
      message:
        "Free 套餐只能有一个项目使用自定义域名。当前该权益已被 sub2api 使用，升级到 Pro 后可在此项目使用自定义域名。",
    });
  });

  it("falls back to quota data when the response omits project details", () => {
    const error = new ApiError(403, "Forbidden", {
      code: "CUSTOM_DOMAIN_PROJECT_LIMIT_REACHED",
    });

    expect(
      getLocalizedCustomDomainProjectLimitError(error, zhCopy, "existing-project")?.message,
    ).toContain("existing-project");
  });

  it("ignores unrelated API errors", () => {
    const error = new ApiError(400, "Bad Request", { code: "SOMETHING_ELSE" });
    expect(getLocalizedCustomDomainProjectLimitError(error, zhCopy)).toBeNull();
  });
});
