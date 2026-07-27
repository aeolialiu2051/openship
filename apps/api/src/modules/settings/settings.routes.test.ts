import { describe, expect, it } from "vitest";
import { getMcpTools } from "../mcp/mcp-tools";
import { settingsRoutes } from "./settings.routes";

describe("settings MCP tool catalog", () => {
  it("exposes the catalog to the dashboard without publishing it as an MCP tool", () => {
    expect(
      settingsRoutes.routes.some((route) => route.method === "GET" && route.path === "/mcp-tools"),
    ).toBe(true);

    expect(getMcpTools().some((tool) => tool.name === "get_settings_mcp_tools")).toBe(false);
  });
});
