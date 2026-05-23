import { describe, expect, it } from "vitest";
import type { TareReport } from "../analysis/types.js";
import { renderHumanReport } from "../reporters/humanReporter.js";
import { renderJsonReport } from "../reporters/jsonReporter.js";

const report: TareReport = {
  version: "0.1.0",
  generatedAt: "2026-01-01T00:00:00.000Z",
  summary: {
    configFiles: 1,
    servers: 2,
    tools: 2,
    estimatedTokens: { claude: 1000, openaiCl100k: 900 },
    contextWindows: {
      "64000": { claude: 2, openaiCl100k: 1 },
      "128000": { claude: 1, openaiCl100k: 1 },
      "200000": { claude: 1, openaiCl100k: 0 }
    },
    insufficientServers: 1
  },
  servers: [
    {
      name: "github",
      sourceConfigPath: "/tmp/mcp.json",
      transport: "stdio",
      toolCount: 1,
      estimatedTokens: { claude: 800, openaiCl100k: 700 },
      inspectionMode: "live",
      confidence: "high",
      warnings: [],
      tools: [
        {
          name: "search_code",
          estimatedTokens: { claude: 700, openaiCl100k: 650 },
          hasInputSchema: true
        }
      ]
    },
    {
      name: "hosted",
      sourceConfigPath: "/tmp/mcp.json",
      transport: "streamable-http",
      toolCount: 0,
      estimatedTokens: { claude: 200, openaiCl100k: 200 },
      inspectionMode: "static-insufficient",
      confidence: "low",
      warnings: ["Static inspection only sees MCP config, not exposed tool definitions."],
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
  recommendations: [{ type: "budget", message: "Use `tare --budget 40000`." }],
  warnings: [],
  metadata: { staticOnly: true, inspectionMode: "static-only" }
};

describe("reporters", () => {
  it("human output marks insufficient static results clearly", () => {
    const output = renderHumanReport(report);

    expect(output).toContain("Static-only mode: insufficient");
    expect(output).toContain("Insufficient data:");
  });

  it("human report includes overlap warnings", () => {
    expect(renderHumanReport(report)).toContain("Overlap warnings: 1 clusters");
  });

  it("JSON report includes overlapClusters", () => {
    const parsed = JSON.parse(renderJsonReport(report)) as TareReport;
    expect(parsed.overlapClusters[0]?.label).toBe("search intent");
  });
});
