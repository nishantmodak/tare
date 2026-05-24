import { writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { measureTools } from "../api/measureTools.js";
import type { McpToolInput } from "../api/types.js";
import { diffReports } from "../diff/diffReports.js";
import { loadReport } from "../diff/loadReport.js";
import { renderHumanReport } from "../reporters/humanReporter.js";
import { tempDir } from "./testUtils.js";

const searchSchema = {
  type: "object",
  properties: {
    query: { type: "string" }
  }
};

function tool(name: string, description?: string): McpToolInput {
  return {
    name,
    description,
    inputSchema: searchSchema
  };
}

describe("measureTools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts unattributed tools and groups them under the default agent server", async () => {
    const report = await measureTools([tool("search_code", "Search code")]);

    expect(report.summary.servers).toBe(1);
    expect(report.servers[0]).toMatchObject({
      name: "agent",
      toolCount: 1
    });
  });

  it("accepts unattributed tools and groups them under a custom server name", async () => {
    const report = await measureTools([tool("search_code", "Search code")], {
      serverName: "runtime-agent"
    });

    expect(report.servers[0]?.name).toBe("runtime-agent");
  });

  it("accepts attributed tools and groups them by server", async () => {
    const report = await measureTools([
      { ...tool("search_code", "Search code"), server: "github" },
      { ...tool("search_issues", "Search issues"), server: "linear" }
    ]);

    expect(report.summary.servers).toBe(2);
    expect(report.servers.map((server) => server.name).sort()).toEqual(["github", "linear"]);
  });

  it("handles mixed attributed and unattributed tools per tool", async () => {
    const report = await measureTools(
      [
        { ...tool("search_code", "Search code"), server: "github" },
        tool("search_docs", "Search docs")
      ],
      { serverName: "fallback-agent" }
    );

    expect(report.servers.map((server) => server.name).sort()).toEqual([
      "fallback-agent",
      "github"
    ]);
  });

  it("returns the correct total tool count", async () => {
    const report = await measureTools([
      tool("search_code", "Search code"),
      tool("create_issue", "Create issue")
    ]);

    expect(report.summary.tools).toBe(2);
  });

  it("returns the correct server count for attributed multi-server input", async () => {
    const report = await measureTools([
      { ...tool("search_code", "Search code"), server: "github" },
      { ...tool("create_issue", "Create issue"), server: "github" },
      { ...tool("search_issues", "Search issues"), server: "linear" }
    ]);

    expect(report.summary.servers).toBe(2);
  });

  it("estimates Claude tokens for each tool", async () => {
    const report = await measureTools([tool("search_code", "Search code")]);

    expect(report.servers[0]?.tools[0]?.estimatedTokens.claude).toBeGreaterThan(0);
  });

  it("estimates OpenAI cl100k tokens for each tool", async () => {
    const report = await measureTools([tool("search_code", "Search code")]);

    expect(report.servers[0]?.tools[0]?.estimatedTokens.openaiCl100k).toBeGreaterThan(0);
  });

  it("detects overlap clusters for tools with similar descriptions", async () => {
    const report = await measureTools([
      { ...tool("search_code", "Search code in repositories"), server: "github" },
      { ...tool("grep", "Find text in files"), server: "filesystem" }
    ]);

    expect(report.overlapClusters[0]?.label).toBe("search intent");
  });

  it("returns no overlap clusters for clearly distinct tools", async () => {
    const report = await measureTools([
      {
        name: "forecast_weather",
        description: "Get weather forecast by location",
        server: "weather"
      },
      { name: "send_email", description: "Send an email message", server: "mail" }
    ]);

    expect(report.overlapClusters).toEqual([]);
  });

  it("marks budget metadata as not exceeded when under budget", async () => {
    const report = await measureTools([tool("search_code", "Search code")], {
      budget: 1_000_000
    });

    expect(report.metadata).toMatchObject({
      budgetExceeded: false,
      budgetTokens: 1_000_000,
      budgetTokenizer: "claude"
    });
  });

  it("marks budget metadata as exceeded when over budget", async () => {
    const report = await measureTools([tool("search_code", "Search code")], { budget: 1 });

    expect(report.metadata.budgetExceeded).toBe(true);
  });

  it("does not call external APIs by default", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await measureTools([tool("search_code", "Search code")]);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a zero-count report for an empty tool list", async () => {
    const report = await measureTools([]);

    expect(report.summary).toMatchObject({
      configFiles: 0,
      servers: 0,
      tools: 0,
      insufficientServers: 0
    });
    expect(report.overlapClusters).toEqual([]);
  });

  it("estimates non-zero tokens for tools with no description", async () => {
    const report = await measureTools([{ name: "ping" }]);

    expect(report.servers[0]?.tools[0]?.estimatedTokens.claude).toBeGreaterThan(0);
  });

  it("marks output servers with programmatic inspection mode", async () => {
    const report = await measureTools([tool("search_code", "Search code")]);

    expect(report.metadata.inspectionMode).toBe("programmatic");
    expect(report.servers[0]?.inspectionMode).toBe("programmatic");
  });

  it("marks output servers with programmatic transport", async () => {
    const report = await measureTools([tool("search_code", "Search code")]);

    expect(report.servers[0]?.transport).toBe("programmatic");
  });

  it("includes programmatic tools in overlap detection", async () => {
    const report = await measureTools([
      { ...tool("create_issue", "Create a GitHub issue"), server: "github" },
      { ...tool("create_issue", "Create a Linear issue"), server: "linear" }
    ]);

    expect(report.overlapClusters[0]?.tools.map((entry) => entry.server).sort()).toEqual([
      "github",
      "linear"
    ]);
  });

  it("does not count programmatic servers as insufficient", async () => {
    const report = await measureTools([tool("search_code", "Search code")]);

    expect(report.summary.insufficientServers).toBe(0);
  });

  it("does not render programmatic servers under insufficient data", async () => {
    const report = await measureTools([tool("search_code", "Search code")]);

    expect(renderHumanReport(report)).not.toContain("Insufficient data:");
  });

  it("loads and compares reports containing programmatic surfaces", async () => {
    const dir = await tempDir();
    try {
      const basePath = path.join(dir.path, "base.json");
      const headPath = path.join(dir.path, "head.json");
      const base = await measureTools([
        { ...tool("search_code", "Search code"), server: "github" }
      ]);
      const head = await measureTools([
        { ...tool("search_code", "Search code"), server: "github" },
        { ...tool("create_issue", "Create issue"), server: "github" }
      ]);

      await writeFile(basePath, JSON.stringify(base), "utf8");
      await writeFile(headPath, JSON.stringify(head), "utf8");

      const loadedBase = await loadReport(basePath);
      const loadedHead = await loadReport(headPath);
      const diff = diffReports(loadedBase.report, loadedHead.report, {
        basePath,
        headPath
      });

      expect(diff.summary.tools.delta).toBe(1);
    } finally {
      await dir.cleanup();
    }
  });

  it("counts annotations, output schema, and metadata when provided", async () => {
    const base = await measureTools([{ name: "search_code" }]);
    const enriched = await measureTools([
      {
        name: "search_code",
        annotations: { title: "Search code" },
        outputSchema: { type: "object", properties: { matches: { type: "array" } } },
        metadata: { risk: "read-only", owner: "platform" }
      }
    ]);

    expect(enriched.summary.estimatedTokens.claude).toBeGreaterThan(
      base.summary.estimatedTokens.claude
    );
  });

  it("accepts Claude-style input_schema tool definitions", async () => {
    const withoutSchema = await measureTools([{ name: "search_code", description: "Search code" }]);
    const withClaudeSchema = await measureTools([
      {
        name: "search_code",
        description: "Search code",
        input_schema: searchSchema
      }
    ]);

    expect(withClaudeSchema.servers[0]?.tools[0]?.hasInputSchema).toBe(true);
    expect(withClaudeSchema.summary.estimatedTokens.claude).toBeGreaterThan(
      withoutSchema.summary.estimatedTokens.claude
    );
  });

  it("includes token warning fallback when API mode is requested without a key", async () => {
    const report = await measureTools([tool("search_code", "Search code")], {
      claudeTokenizerMode: "api"
    });

    expect(report.warnings.join("\n")).toContain("ANTHROPIC_API_KEY");
  });

  it("throws a clear TypeError for invalid tool input", async () => {
    await expect(measureTools([{ description: "missing name" } as never])).rejects.toThrow(
      TypeError
    );
  });
});
