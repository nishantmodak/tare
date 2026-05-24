import type { ClaudeTokenizerMode } from "../tokens/types.js";

export type McpToolInput = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  input_schema?: unknown;
  annotations?: unknown;
  outputSchema?: unknown;
  metadata?: unknown;
};

export type AttributedMcpToolInput = McpToolInput & {
  server: string;
};

export type MeasureToolsOptions = {
  serverName?: string;
  budget?: number;
  claudeTokenizerMode?: ClaudeTokenizerMode;
  anthropicApiKey?: string;
  anthropicModel?: string;
  timeoutMs?: number;
};
