import type {
  InspectionMode,
  InspectedServer,
  NormalizedServer,
  ReportTransportKind
} from "./types.js";
import { toReportTransport } from "./types.js";

function urlHost(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

export function createStaticInspection(
  server: NormalizedServer,
  mode: InspectionMode = "static-insufficient",
  warnings?: string[]
): InspectedServer {
  const defaultWarnings =
    mode === "static-insufficient"
      ? [
          "Static inspection only sees MCP config, not exposed tool definitions.",
          "Run without --no-exec to inspect actual tool schemas."
        ]
      : [
          "Live inspection failed. Server may require credentials, authorization, or failed during startup.",
          "Static fallback cannot see actual tool definitions.",
          "Run again after configuring credentials or headers."
        ];

  return {
    name: server.name,
    sourceConfigPath: server.sourceConfigPath,
    transport: toReportTransport(server.transport) as ReportTransportKind,
    command: server.command,
    args: server.args,
    urlHost: urlHost(server.url),
    toolDefinitions: [],
    inspectionMode: mode,
    confidence: "low",
    warnings: warnings ?? defaultWarnings
  };
}
