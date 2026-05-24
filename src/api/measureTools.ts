import { analyzeServers } from "../analysis/analyze.js";
import type { TareReport } from "../analysis/types.js";
import type { InspectedServer, McpToolDefinition } from "../inspectors/types.js";
import { TokenEstimator } from "../tokens/countTokens.js";
import type { AttributedMcpToolInput, McpToolInput, MeasureToolsOptions } from "./types.js";

const DEFAULT_SERVER_NAME = "agent";
const PROGRAMMATIC_SOURCE = "programmatic";

type MeasureToolInput = McpToolInput | AttributedMcpToolInput;

export async function measureTools(
  tools: readonly (McpToolInput | AttributedMcpToolInput)[],
  options: MeasureToolsOptions = {}
): Promise<TareReport> {
  validateTools(tools);
  const normalizedOptions = validateOptions(options);

  const tokenWarnings: string[] = [];
  const inspectedServers = inspectedServersFromTools(tools, normalizedOptions.serverName);
  const report = await analyzeServers(
    inspectedServers,
    new TokenEstimator({
      claudeTokenizerMode: normalizedOptions.claudeTokenizerMode ?? "local",
      anthropicApiKey: normalizedOptions.anthropicApiKey,
      anthropicModel: normalizedOptions.anthropicModel,
      timeoutMs: normalizedOptions.timeoutMs,
      onWarning: (warning) => tokenWarnings.push(warning)
    }),
    {
      configFiles: 0,
      staticOnly: false,
      inspectionMode: "programmatic"
    }
  );

  report.warnings.push(...tokenWarnings);

  if (normalizedOptions.budget !== undefined) {
    report.metadata.budgetTokens = normalizedOptions.budget;
    report.metadata.budgetTokenizer = "claude";
    report.metadata.budgetExceeded =
      report.summary.estimatedTokens.claude > normalizedOptions.budget;
  }

  return report;
}

function inspectedServersFromTools(
  tools: readonly MeasureToolInput[],
  fallbackServerName: string | undefined
): InspectedServer[] {
  const groups = new Map<string, McpToolDefinition[]>();
  const defaultServerName = normalizeServerName(fallbackServerName) ?? DEFAULT_SERVER_NAME;

  for (const tool of tools) {
    const serverName = serverNameForTool(tool, defaultServerName);
    const group = groups.get(serverName) ?? [];
    group.push(toToolDefinition(tool));
    groups.set(serverName, group);
  }

  return [...groups.entries()].map(([name, toolDefinitions]) => ({
    name,
    sourceConfigPath: PROGRAMMATIC_SOURCE,
    transport: "programmatic",
    toolDefinitions,
    inspectionMode: "programmatic",
    confidence: "high",
    warnings: []
  }));
}

function serverNameForTool(tool: MeasureToolInput, fallbackServerName: string): string {
  return isAttributedTool(tool)
    ? (normalizeServerName(tool.server) ?? fallbackServerName)
    : fallbackServerName;
}

function toToolDefinition(tool: McpToolInput): McpToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema ?? tool.input_schema,
    annotations: tool.annotations,
    outputSchema: tool.outputSchema,
    metadata: tool.metadata
  };
}

function isAttributedTool(tool: MeasureToolInput): tool is AttributedMcpToolInput {
  return "server" in tool && typeof tool.server === "string" && tool.server.trim().length > 0;
}

function normalizeServerName(serverName: string | undefined): string | undefined {
  const trimmed = serverName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function validateTools(tools: readonly MeasureToolInput[]): void {
  if (!Array.isArray(tools)) {
    throw new TypeError("measureTools expected tools to be an array.");
  }

  for (const [index, tool] of tools.entries()) {
    if (!tool || typeof tool !== "object") {
      throw new TypeError(`measureTools expected tools[${index}] to be an object.`);
    }

    if (typeof tool.name !== "string" || tool.name.trim().length === 0) {
      throw new TypeError(`measureTools expected tools[${index}].name to be a non-empty string.`);
    }

    if (
      "server" in tool &&
      tool.server !== undefined &&
      (typeof tool.server !== "string" || tool.server.trim().length === 0)
    ) {
      throw new TypeError(
        `measureTools expected tools[${index}].server to be a non-empty string when provided.`
      );
    }
  }
}

function validateOptions(options: MeasureToolsOptions): MeasureToolsOptions {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("measureTools expected options to be an object when provided.");
  }

  if (options.serverName !== undefined && normalizeServerName(options.serverName) === undefined) {
    throw new TypeError("measureTools expected options.serverName to be a non-empty string.");
  }

  if (options.budget !== undefined && (!Number.isFinite(options.budget) || options.budget < 0)) {
    throw new TypeError("measureTools expected options.budget to be a non-negative number.");
  }

  if (
    options.timeoutMs !== undefined &&
    (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
  ) {
    throw new TypeError("measureTools expected options.timeoutMs to be a positive number.");
  }

  if (
    options.claudeTokenizerMode !== undefined &&
    options.claudeTokenizerMode !== "local" &&
    options.claudeTokenizerMode !== "api"
  ) {
    throw new TypeError(
      'measureTools expected options.claudeTokenizerMode to be "local" or "api".'
    );
  }

  if (options.anthropicApiKey !== undefined && typeof options.anthropicApiKey !== "string") {
    throw new TypeError("measureTools expected options.anthropicApiKey to be a string.");
  }

  if (options.anthropicModel !== undefined && typeof options.anthropicModel !== "string") {
    throw new TypeError("measureTools expected options.anthropicModel to be a string.");
  }

  return options;
}
