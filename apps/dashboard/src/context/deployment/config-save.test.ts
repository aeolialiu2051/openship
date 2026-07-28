import { describe, expect, it } from "vitest";
import { diffProjectEnvironment, serializeComposeServices } from "./config-save";

describe("config edit persistence", () => {
  it("preserves untouched masked secrets while updating, adding, and deleting named vars", () => {
    const diff = diffProjectEnvironment(
      [
        { key: "TOKEN", value: "••••••••", environment: "production", isSecret: true },
        { key: "PORT", value: "3000", environment: "production", isSecret: false },
        { key: "REMOVE_ME", value: "old", environment: "production", isSecret: false },
        { key: "PREVIEW_ONLY", value: "x", environment: "preview", isSecret: false },
      ],
      [
        { key: "TOKEN", value: "", visible: true },
        { key: "PORT", value: "8080", visible: true },
        { key: "NEW_SECRET", value: "new", visible: false },
      ],
    );

    expect(diff).toEqual({
      environment: "production",
      upserts: [
        { key: "PORT", value: "8080", isSecret: false },
        { key: "NEW_SECRET", value: "new", isSecret: true },
      ],
      deletes: ["REMOVE_ME"],
    });
  });

  it("serializes compose environment, runtime, volumes, and routing", () => {
    const [service] = serializeComposeServices([
      {
        name: "web",
        image: "example/web:latest",
        ports: ["8080:80"],
        dependsOn: ["db"],
        environment: { API_URL: "http://api:3000" },
        volumes: ["data:/app/data:ro"],
        restart: "unless-stopped",
        exposed: true,
        exposedPort: "80",
        domain: "demo-web",
        domainType: "free",
      },
    ]);

    expect(service).toMatchObject({
      name: "web",
      kind: "compose",
      ports: ["8080:80"],
      dependsOn: ["db"],
      environment: { API_URL: "http://api:3000" },
      volumes: ["data:/app/data:ro"],
      restart: "unless-stopped",
      exposed: true,
      exposedPort: "80",
      domain: "demo-web",
      domainType: "free",
      sortOrder: 0,
    });
  });
});
