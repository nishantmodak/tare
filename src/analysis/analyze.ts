import { VERSION } from "../version.js";
import type { InspectedServer, ToolContextPayload } from "../inspectors/types.js";
import { stableStringify } from "../utils/stableJson.js";
import type { TokenEstimator } from "../tokens/countTokens.js";
import { buildRecommendations } from "./recommendations.js";
import { OverlapDetector } from "./overlapDetector.js";
import type { AnalyzedTool, TareReport } from "./types.js";

export type AnalyzeOptions = {
  configFiles: number;
  staticOnly: boolean;
  warnings?: string[];
  inspectionMode?: "live default" | "static-only" | "programmatic";
};

function windowUsage(tokens: number, window: number): number {
  return Math.round((tokens / window) * 100);
}

function serverMetadata(server: InspectedServer): string {
  return stableStringify({
    server: server.name,
    transport: server.transport,
    command: server.command,
    args: server.args,
    urlHost: server.urlHost
  });
}

function toolPayload(
  server: InspectedServer,
  tool: InspectedServer["toolDefinitions"][number]
): string {
  const payload: ToolContextPayload = {
    server: server.name,
    transport: server.transport,
    tool: {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
      outputSchema: tool.outputSchema,
      metadata: tool.metadata
    }
  };

  return stableStringify(payload);
}

export async function analyzeServers(
  inspectedServers: InspectedServer[],
  tokenEstimator: TokenEstimator,
  options: AnalyzeOptions
): Promise<TareReport> {
  const warnings = [...(options.warnings ?? [])];
  const analyzedServers: TareReport["servers"] = [];
  const liveToolsForOverlap: AnalyzedTool[] = [];

  for (const server of inspectedServers) {
    const metadataEstimate = await tokenEstimator.count(serverMetadata(server));
    let serverClaude = metadataEstimate.claude.tokens;
    let serverOpenAi = metadataEstimate.openaiCl100k.tokens;

    const tools: TareReport["servers"][number]["tools"] = [];

    for (const tool of server.toolDefinitions) {
      const estimates = await tokenEstimator.count(toolPayload(server, tool));
      serverClaude += estimates.claude.tokens;
      serverOpenAi += estimates.openaiCl100k.tokens;

      const analyzedTool = {
        server: server.name,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        estimatedTokens: {
          claude: estimates.claude.tokens,
          openaiCl100k: estimates.openaiCl100k.tokens
        },
        hasInputSchema: tool.inputSchema !== undefined
      };

      tools.push({
        name: analyzedTool.name,
        description: analyzedTool.description,
        estimatedTokens: analyzedTool.estimatedTokens,
        hasInputSchema: analyzedTool.hasInputSchema
      });

      if (server.inspectionMode === "live" || server.inspectionMode === "programmatic") {
        liveToolsForOverlap.push(analyzedTool);
      }
    }

    analyzedServers.push({
      name: server.name,
      sourceConfigPath: server.sourceConfigPath,
      transport: server.transport,
      command: server.command,
      args: server.args,
      urlHost: server.urlHost,
      toolCount: tools.length,
      estimatedTokens: {
        claude: serverClaude,
        openaiCl100k: serverOpenAi
      },
      inspectionMode: server.inspectionMode,
      confidence: server.confidence,
      warnings: server.warnings,
      tools: tools.sort((a, b) => b.estimatedTokens.claude - a.estimatedTokens.claude)
    });
  }

  analyzedServers.sort((a, b) => b.estimatedTokens.claude - a.estimatedTokens.claude);

  const totalClaude = analyzedServers.reduce(
    (sum, server) => sum + server.estimatedTokens.claude,
    0
  );
  const totalOpenAi = analyzedServers.reduce(
    (sum, server) => sum + server.estimatedTokens.openaiCl100k,
    0
  );
  const overlapClusters = new OverlapDetector().detect(liveToolsForOverlap);

  const report: TareReport = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    summary: {
      configFiles: options.configFiles,
      servers: analyzedServers.length,
      tools: analyzedServers.reduce((sum, server) => sum + server.toolCount, 0),
      estimatedTokens: {
        claude: totalClaude,
        openaiCl100k: totalOpenAi
      },
      contextWindows: {
        "64000": {
          claude: windowUsage(totalClaude, 64000),
          openaiCl100k: windowUsage(totalOpenAi, 64000)
        },
        "128000": {
          claude: windowUsage(totalClaude, 128000),
          openaiCl100k: windowUsage(totalOpenAi, 128000)
        },
        "200000": {
          claude: windowUsage(totalClaude, 200000),
          openaiCl100k: windowUsage(totalOpenAi, 200000)
        }
      },
      insufficientServers: analyzedServers.filter(
        (server) =>
          server.inspectionMode === "static-insufficient" ||
          server.inspectionMode === "fallback-static-insufficient"
      ).length
    },
    servers: analyzedServers,
    overlapClusters,
    recommendations: [],
    warnings,
    metadata: {
      staticOnly: options.staticOnly,
      inspectionMode:
        options.inspectionMode ?? (options.staticOnly ? "static-only" : "live default")
    }
  };

  report.recommendations = buildRecommendations(report);
  return report;
}
