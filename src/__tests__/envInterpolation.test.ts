import { describe, expect, it } from "vitest";
import { resolveHeaderEnv } from "../utils/envInterpolation.js";

describe("resolveHeaderEnv", () => {
  it("resolves header env interpolation", () => {
    const result = resolveHeaderEnv(
      { Authorization: "Bearer ${LAST9_MCP_TOKEN}" },
      { LAST9_MCP_TOKEN: "abc123" }
    );

    expect(result).toEqual({
      ok: true,
      headers: { Authorization: "Bearer abc123" },
      missing: []
    });
  });

  it("reports missing header env interpolation gracefully", () => {
    const result = resolveHeaderEnv({ Authorization: "Bearer ${LAST9_MCP_TOKEN}" }, {});

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["LAST9_MCP_TOKEN"]);
    expect(result.headers.Authorization).toBe("Bearer ");
  });
});
