import { describe, expect, it } from "vitest";
import { CreateProjectBody, UpdateProjectBody } from "../../../src/modules/projects/project.schema";

describe("project route key schemas", () => {
  it("accepts routeKey during creation but never exposes it as editable config", () => {
    expect(CreateProjectBody.properties).toHaveProperty("routeKey");
    expect(UpdateProjectBody.properties).not.toHaveProperty("routeKey");
  });
});
