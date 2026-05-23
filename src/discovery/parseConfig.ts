import { z } from "zod";
import { readUtf8 } from "../utils/fs.js";
import { normalizeServer } from "./normalizeServer.js";
import type { NormalizedServer } from "../inspectors/types.js";

const ObjectSchema = z.record(z.string(), z.unknown());

export type ParsedConfig = {
  path: string;
  servers: NormalizedServer[];
  warnings: string[];
};

function readServerMap(
  raw: Record<string, unknown>,
  keyPath: string
): Record<string, unknown> | undefined {
  const segments = keyPath.split(".");
  let current: unknown = raw;

  for (const segment of segments) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return undefined;
  }

  return current as Record<string, unknown>;
}

export function parseConfigText(text: string, sourceConfigPath: string): ParsedConfig {
  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      path: sourceConfigPath,
      servers: [],
      warnings: [`${sourceConfigPath}: malformed JSON (${(error as Error).message}).`]
    };
  }

  const parsed = ObjectSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      path: sourceConfigPath,
      servers: [],
      warnings: [`${sourceConfigPath}: config root must be a JSON object.`]
    };
  }

  const config = parsed.data;
  const maps = [
    readServerMap(config, "mcpServers"),
    readServerMap(config, "servers"),
    readServerMap(config, "mcp.servers")
  ].filter((entry): entry is Record<string, unknown> => Boolean(entry));

  const servers: NormalizedServer[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const map of maps) {
    for (const [name, serverConfig] of Object.entries(map)) {
      if (seen.has(name)) {
        warnings.push(`${sourceConfigPath}: duplicate server "${name}" was ignored.`);
        continue;
      }

      const normalized = normalizeServer(name, serverConfig, sourceConfigPath);
      warnings.push(...normalized.warnings);
      if (normalized.server) {
        seen.add(name);
        servers.push(normalized.server);
      }
    }
  }

  if (maps.length === 0) {
    warnings.push(`${sourceConfigPath}: no MCP server map found.`);
  }

  return { path: sourceConfigPath, servers, warnings };
}

export async function parseConfigFile(filePath: string): Promise<ParsedConfig> {
  return parseConfigText(await readUtf8(filePath), filePath);
}
