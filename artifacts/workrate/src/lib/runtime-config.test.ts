import { describe, expect, test } from "vitest";
import { fetchRuntimeConfig, isRuntimeConfig } from "./runtime-config";

describe("runtime configuration", () => {
  test("only accepts the supported server-owned environments", () => {
    expect(isRuntimeConfig({ environment: "staging", buildId: "build-42" })).toBe(true);
    expect(isRuntimeConfig({ environment: "preview", buildId: "build-42" })).toBe(false);
    expect(isRuntimeConfig({ environment: "production", buildId: "" })).toBe(false);
  });

  test("requests the authoritative same-origin endpoint without caching", async () => {
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe("/api/runtime-config");
      expect(init).toMatchObject({ cache: "no-store", credentials: "same-origin" });
      return new Response(JSON.stringify({ environment: "development", buildId: "dev-1" }));
    };

    await expect(fetchRuntimeConfig(fetcher)).resolves.toEqual({
      environment: "development",
      buildId: "dev-1",
    });
  });
});