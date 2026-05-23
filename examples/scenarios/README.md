# Scenario Examples

Copy one of these files into an empty directory as `.mcp.json`, then run `tare-mcp` from that directory.

## Hosted Streamable HTTP

Use this when you want to inspect a hosted MCP endpoint.

```bash
mkdir -p /tmp/tare-mcp-hosted
cd /tmp/tare-mcp-hosted
cp /path/to/tare-mcp/examples/scenarios/hosted-streamable-http.mcp.json .mcp.json
export LAST9_MCP_TOKEN="..."
npx tare-mcp --timeout 10000
```

This config uses:

```txt
https://mcp.last9.io/mcp
```

If the token is missing or invalid, `tare-mcp` reports a `401 Unauthorized` fallback instead of crashing.

## Local stdio

Use this when you want to inspect a packaged stdio MCP server.

```bash
mkdir -p /tmp/tare-mcp-stdio
cd /tmp/tare-mcp-stdio
cp /path/to/tare-mcp/examples/scenarios/local-stdio.mcp.json .mcp.json
npx tare-mcp --timeout 10000
```

## Static-only CI Check

Use this when CI should not execute MCP server commands or call hosted MCP URLs.

```bash
npx tare-mcp --no-exec --json
```

Static-only output is intentionally marked insufficient because it cannot see exposed tool schemas.
