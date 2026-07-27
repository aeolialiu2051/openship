import { describe, expect, it } from "vitest";
import { getMcpTools } from "../mcp/mcp-tools";
import { serverSystemRoutes } from "./server-system.routes";

describe("serverSystemRoutes", () => {
  it("exposes the per-server port scan in user-server mode", () => {
    expect(
      serverSystemRoutes.routes.some(
        (route) => route.method === "POST" && route.path === "/servers/:id/ports/scan",
      ),
    ).toBe(true);
  });

  it("publishes read-only server discovery and Docker overview MCP tools", () => {
    const tools = getMcpTools();

    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "get_system_servers",
        "get_system_servers_by_id",
        "get_system_servers_by_id_docker_overview",
      ]),
    );
    expect(
      tools.find((tool) => tool.name === "get_system_servers_by_id_docker_overview")?.annotations,
    ).toEqual({ readOnlyHint: true, destructiveHint: false });
  });
});
