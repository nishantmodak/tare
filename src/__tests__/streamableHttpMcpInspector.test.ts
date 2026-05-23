import { describe, expect, it, vi } from "vitest";
import { inspectStreamableHttpServer } from "../inspectors/streamableHttpMcpInspector.js";
import type { NormalizedServer } from "../inspectors/types.js";

function httpServer(overrides: Partial<NormalizedServer> = {}): NormalizedServer {
  return {
    name: "hosted",
    url: "http://127.0.0.1/mcp",
    sourceConfigPath: "/tmp/mcp.json",
    transport: "streamable-http",
    ...overrides
  };
}

function statusFetch(status: number): typeof fetch {
  return vi.fn(async () => new Response("fixture", { status })) as unknown as typeof fetch;
}

describe("inspectStreamableHttpServer", () => {
  it("handles hosted server auth failure gracefully", async () => {
    const result = await inspectStreamableHttpServer(
      httpServer({ headers: { Authorization: "Bearer hosted-secret-token" } }),
      { timeoutMs: 500, fetch: statusFetch(401) }
    );

    const serialized = JSON.stringify(result);
    expect(result.inspectionMode).toBe("fallback-static-insufficient");
    expect(result.warnings.join("\n")).toContain("credentials");
    expect(serialized).not.toContain("hosted-secret-token");
  });

  it.each([404, 405, 415])(
    "handles %s as wrong endpoint or incompatible transport",
    async (status) => {
      const result = await inspectStreamableHttpServer(httpServer(), {
        timeoutMs: 500,
        fetch: statusFetch(status)
      });

      expect(result.inspectionMode).toBe("fallback-static-insufficient");
      expect(result.warnings.join("\n")).toContain("URL may not be the MCP endpoint");
    }
  );

  it("falls back on timeout", async () => {
    const neverFetch = vi.fn(() => new Promise<Response>(() => undefined));

    const result = await inspectStreamableHttpServer(httpServer(), {
      timeoutMs: 50,
      fetch: neverFetch as unknown as typeof fetch
    });

    expect(result.inspectionMode).toBe("fallback-static-insufficient");
    expect(result.warnings.join("\n")).toContain("Streamable HTTP inspection failed after");
  });

  it("missing header env interpolation fails gracefully", async () => {
    const result = await inspectStreamableHttpServer(
      httpServer({ headers: { Authorization: "Bearer ${MISSING_TARE_TEST_TOKEN}" } }),
      { timeoutMs: 50 }
    );

    expect(result.inspectionMode).toBe("fallback-static-insufficient");
    expect(result.warnings.join("\n")).toContain(
      "missing environment variable MISSING_TARE_TEST_TOKEN"
    );
  });
});
