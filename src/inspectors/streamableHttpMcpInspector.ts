import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { VERSION } from "../version.js";
import { resolveHeaderEnv } from "../utils/envInterpolation.js";
import { collectSecretValues, redactText } from "../utils/redact.js";
import { formatTimeout, TimeoutError, withTimeout } from "../utils/timeout.js";
import { createStaticInspection } from "./staticInspector.js";
import type { InspectorOptions, InspectedServer, McpToolDefinition, NormalizedServer } from "./types.js";

type SdkTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: unknown;
  outputSchema?: unknown;
  _meta?: unknown;
  metadata?: unknown;
};

function normalizeTool(tool: SdkTool): McpToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    outputSchema: tool.outputSchema,
    metadata: tool.metadata ?? tool._meta
  };
}

async function listAllTools(client: Client): Promise<McpToolDefinition[]> {
  const tools: McpToolDefinition[] = [];
  let cursor: string | undefined;

  do {
    const result = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...result.tools.map(normalizeTool));
    cursor = result.nextCursor;
  } while (cursor);

  return tools;
}

function errorStatus(error: unknown): number | undefined {
  if (error instanceof StreamableHTTPError) {
    return error.code;
  }

  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    return Number.isFinite(status) ? status : undefined;
  }

  const text = error instanceof Error ? error.message : String(error ?? "");
  const match = text.match(/\b(401|403|404|405|415|500|502|503|504)\b/);
  return match ? Number(match[1]) : undefined;
}

function failureWarnings(error: unknown, timeoutMs: number, secrets: string[]): string[] {
  const status = errorStatus(error);
  const safeError = redactText(error, secrets);

  if (error instanceof TimeoutError) {
    return [
      `Streamable HTTP inspection failed after ${formatTimeout(timeoutMs)}.`,
      "The server may require credentials, an Authorization header, or a valid MCP session.",
      "Static config only sees URL/headers metadata, not actual tool schemas.",
      "Token estimate for this server is insufficient."
    ];
  }

  if (status === 401 || status === 403) {
    const label = status === 401 ? "401 Unauthorized" : "403 Forbidden";
    return [
      `Streamable HTTP inspection failed with ${label}.`,
      "The server requires valid credentials or Authorization headers.",
      "Static fallback cannot see actual tool schemas."
    ];
  }

  if (status === 404 || status === 405 || status === 415) {
    return [
      `Streamable HTTP inspection failed with ${status}.`,
      "The URL may not be the MCP endpoint or may use a different transport.",
      "Static fallback cannot see actual tool schemas."
    ];
  }

  return [
    "Streamable HTTP inspection failed.",
    "The server may require credentials, an Authorization header, or a valid MCP session.",
    "Static config only sees URL/headers metadata, not actual tool schemas.",
    "Token estimate for this server is insufficient.",
    safeError ? `Sanitized error: ${safeError}` : "No error detail was available."
  ];
}

export async function inspectStreamableHttpServer(
  server: NormalizedServer,
  options: InspectorOptions
): Promise<InspectedServer> {
  if (!server.url) {
    return createStaticInspection(server, "fallback-static-insufficient", [
      "Streamable HTTP inspection failed.",
      "HTTP server config has no url.",
      "Static config only sees URL/headers metadata, not actual tool schemas.",
      "Token estimate for this server is insufficient."
    ]);
  }

  let url: URL;
  try {
    url = new URL(server.url);
  } catch {
    return createStaticInspection(server, "fallback-static-insufficient", [
      "Streamable HTTP inspection failed.",
      "HTTP server config has an invalid url.",
      "Static config only sees URL/headers metadata, not actual tool schemas.",
      "Token estimate for this server is insufficient."
    ]);
  }

  const headerResolution = resolveHeaderEnv(server.headers);
  if (!headerResolution.ok) {
    const firstMissing = headerResolution.missing[0] ?? "unknown";
    const headerName =
      Object.keys(server.headers ?? {}).find((key) => (server.headers?.[key] ?? "").includes(firstMissing)) ??
      "configured";

    return createStaticInspection(server, "fallback-static-insufficient", [
      `missing environment variable ${firstMissing} for ${headerName} header.`,
      "Static config only sees URL/headers metadata, not actual tool schemas.",
      "Token estimate for this server is insufficient."
    ]);
  }

  const secrets = collectSecretValues(server.headers, headerResolution.headers);
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: headerResolution.headers
    }
  });
  const client = new Client({ name: "tare", version: VERSION }, { capabilities: {} });

  const close = async () => {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
  };

  try {
    const tools = await withTimeout(
      (async () => {
        await client.connect(transport);
        return listAllTools(client);
      })(),
      options.timeoutMs,
      close
    );

    await close();

    return {
      name: server.name,
      sourceConfigPath: server.sourceConfigPath,
      transport: "streamable-http",
      urlHost: url.host,
      toolDefinitions: tools,
      inspectionMode: "live",
      confidence: "high",
      warnings: []
    };
  } catch (error) {
    await close();
    return createStaticInspection(
      server,
      "fallback-static-insufficient",
      failureWarnings(error, options.timeoutMs, secrets)
    );
  }
}
