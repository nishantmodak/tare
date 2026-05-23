import { describe, expect, it } from "vitest";
import { analyzeServers } from "../analysis/analyze.js";
import type { InspectedServer } from "../inspectors/types.js";
import { createStaticInspection } from "../inspectors/staticInspector.js";
import { TokenEstimator } from "../tokens/countTokens.js";

const liveServer: InspectedServer = {
  name: "github",
  sourceConfigPath: "/tmp/mcp.json",
  transport: "stdio",
  command: "node",
  args: ["github.js"],
  toolDefinitions: [
    {
      name: "search_code",
      description: "Search code in a repository",
      inputSchema: { type: "object", properties: { query: { type: "string" } } }
    }
  ],
  inspectionMode: "live",
  confidence: "high",
  warnings: []
};

describe("analyzeServers", () => {
  it("includes dual token estimates and JSON report fields", async () => {
    const report = await analyzeServers(
      [liveServer],
      new TokenEstimator({ claudeTokenizerMode: "local" }),
      {
        configFiles: 1,
        staticOnly: false
      }
    );

    expect(report.summary.estimatedTokens.claude).toBeGreaterThan(0);
    expect(report.summary.estimatedTokens.openaiCl100k).toBeGreaterThan(0);
    expect(report.servers[0]?.tools[0]?.estimatedTokens.claude).toBeGreaterThan(0);
    expect(report.overlapClusters).toEqual([]);
  });

  it("marks static fallback as insufficient", async () => {
    const report = await analyzeServers(
      [
        createStaticInspection(
          {
            name: "github",
            command: "npx",
            sourceConfigPath: "/tmp/mcp.json",
            transport: "stdio"
          },
          "fallback-static-insufficient"
        )
      ],
      new TokenEstimator({ claudeTokenizerMode: "local" }),
      { configFiles: 1, staticOnly: false }
    );

    expect(report.summary.insufficientServers).toBe(1);
    expect(report.servers[0]?.inspectionMode).toBe("fallback-static-insufficient");
  });
});
