import { describe, expect, it } from "vitest";
import type { TareReport } from "../analysis/types.js";
import { budgetActual, renderBudgetFailure } from "../reporters/humanReporter.js";

function report(): TareReport {
  return {
    version: "0.1.0",
    generatedAt: "2026-01-01T00:00:00.000Z",
    summary: {
      configFiles: 1,
      servers: 1,
      tools: 2,
      estimatedTokens: { claude: 1200, openaiCl100k: 900 },
      contextWindows: {
        "64000": { claude: 2, openaiCl100k: 1 },
        "128000": { claude: 1, openaiCl100k: 1 },
        "200000": { claude: 1, openaiCl100k: 0 }
      },
      insufficientServers: 0
    },
    servers: [
      {
        name: "github",
        sourceConfigPath: "/tmp/mcp.json",
        transport: "stdio",
        toolCount: 2,
        estimatedTokens: { claude: 1200, openaiCl100k: 900 },
        inspectionMode: "live",
        confidence: "high",
        warnings: [],
        tools: []
      }
    ],
    overlapClusters: [
      {
        label: "search intent",
        score: 0.9,
        reason: "tools share a search intent",
        signals: ["intent-heuristic"],
        tools: [
          { server: "github", name: "search_code" },
          { server: "filesystem", name: "grep" }
        ],
        recommendation: "Prefer one search surface per workflow."
      }
    ],
    recommendations: [],
    warnings: [],
    metadata: { staticOnly: false, inspectionMode: "live default" }
  };
}

describe("budget behavior", () => {
  it("uses Claude estimate by default", () => {
    expect(budgetActual(report(), "claude")).toBe(1200);
  });

  it("can use OpenAI cl100k estimate", () => {
    expect(budgetActual(report(), "openai")).toBe(900);
  });

  it("budget failure includes largest overlap cluster", () => {
    const output = renderBudgetFailure(report(), 100, "claude");

    expect(output).toContain("FAILED: MCP context budget exceeded.");
    expect(output).toContain("Largest overlap cluster:");
    expect(output).toContain("github.search_code");
  });
});
