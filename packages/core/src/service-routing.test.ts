import { describe, expect, it } from "vitest";
import { defaultServiceHostnameLabel } from "./service-routing";

describe("defaultServiceHostnameLabel", () => {
  it("does not repeat the project label when the compose service has the same name", () => {
    expect(defaultServiceHostnameLabel("qwenpaw", "qwenpaw")).toBe("qwenpaw");
  });

  it("compares normalized project and service labels", () => {
    expect(defaultServiceHostnameLabel("My App", "my-app")).toBe("my-app");
  });

  it("keeps distinct compose services namespaced", () => {
    expect(defaultServiceHostnameLabel("qwenpaw", "api")).toBe("qwenpaw-api");
  });

  it("keeps equal monorepo app names namespaced", () => {
    expect(defaultServiceHostnameLabel("qwenpaw", "qwenpaw", "monorepo")).toBe(
      "qwenpaw-qwenpaw",
    );
  });
});
