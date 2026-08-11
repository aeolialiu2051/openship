import { describe, expect, it } from "vitest";
import { resolveCollectionApiUrls } from "./collection-api-url";

describe("resolveCollectionApiUrls", () => {
  it("keeps the private API server-side and gives production browsers the public proxy", () => {
    expect(
      resolveCollectionApiUrls({
        nodeEnv: "production",
        internalApiUrl: "http://api:4100/",
        cloudApiUrl: "https://vibrail.com/api/proxy/",
      }),
    ).toEqual({
      serverApiUrl: "http://api:4100",
      browserApiUrl: "https://vibrail.com/api/proxy",
    });
  });

  it("uses the local API for both sides in development", () => {
    expect(
      resolveCollectionApiUrls({
        nodeEnv: "development",
        cloudApiUrl: "https://vibrail.com/api/proxy",
      }),
    ).toEqual({
      serverApiUrl: "http://localhost:4100",
      browserApiUrl: "http://localhost:4100",
    });
  });

  it("honors an explicit public browser override", () => {
    expect(
      resolveCollectionApiUrls({
        nodeEnv: "production",
        publicApiUrl: "https://api.example.com/",
        cloudApiUrl: "https://vibrail.com/api/proxy",
      }),
    ).toEqual({
      serverApiUrl: "https://api.example.com",
      browserApiUrl: "https://api.example.com",
    });
  });
});
