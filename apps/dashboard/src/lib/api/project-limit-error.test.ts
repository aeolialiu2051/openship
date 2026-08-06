import { describe, expect, it } from "vitest";
import { ApiError } from "./client";
import { getLocalizedProjectLimitError } from "./project-limit-error";

const zhCopy = {
  errorTitle: "项目数量已达上限",
  limitReached: "当前套餐最多可创建 {limit} 个项目。",
};

describe("getLocalizedProjectLimitError", () => {
  it("uses the stable error code and structured project limit", () => {
    const error = new ApiError(400, "Bad Request", {
      code: "PROJECT_LIMIT_REACHED",
      message: "Project limit reached (5)",
      details: { limit: 5 },
    });

    expect(getLocalizedProjectLimitError(error, zhCopy)).toEqual({
      title: "项目数量已达上限",
      message: "当前套餐最多可创建 5 个项目。",
    });
  });

  it("ignores unrelated API errors", () => {
    const error = new ApiError(400, "Bad Request", { code: "VALIDATION_ERROR" });
    expect(getLocalizedProjectLimitError(error, zhCopy)).toBeNull();
  });
});
