export type TransportKind = "stdio" | "streamable-http" | "http" | "sse" | "unknown";

export type ReportTransportKind = "stdio" | "streamable-http" | "sse" | "unknown";

export type InspectionMode = "live" | "static-insufficient" | "fallback-static-insufficient";

export type Confidence = "high" | "medium" | "low";

export type NormalizedServer = {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  disabled?: boolean;
  sourceConfigPath: string;
  transport?: TransportKind;
};

export type McpToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: unknown;
  outputSchema?: unknown;
  metadata?: unknown;
};

export type InspectedServer = {
  name: string;
  sourceConfigPath: string;
  transport: ReportTransportKind;
  command?: string;
  args?: string[];
  urlHost?: string;
  toolDefinitions: McpToolDefinition[];
  inspectionMode: InspectionMode;
  confidence: Confidence;
  warnings: string[];
};

export type InspectorOptions = {
  timeoutMs: number;
};

export type ToolContextPayload = {
  server: string;
  transport: ReportTransportKind;
  tool: {
    name: string;
    description?: string;
    inputSchema?: unknown;
    annotations?: unknown;
    outputSchema?: unknown;
    metadata?: unknown;
  };
};

export function toReportTransport(transport?: TransportKind): ReportTransportKind {
  if (transport === "stdio" || transport === "streamable-http" || transport === "sse") {
    return transport;
  }

  if (transport === "http") {
    return "streamable-http";
  }

  return "unknown";
}
