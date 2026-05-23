# Live Streamable HTTP example

This is a tiny no-credentials MCP server for smoke-testing `tare-mcp` live inspection over Streamable HTTP.

From the repository root:

```bash
pnpm install
pnpm build
```

Terminal 1:

```bash
cd examples/live-streamable-http
node server.mjs
```

Terminal 2:

```bash
cd examples/live-streamable-http
mkdir -p .home
HOME="$PWD/.home" node ../../dist/cli.js
```

The temporary `HOME` keeps the run focused on this example's `.mcp.json` instead of reading your real Claude, Cursor, or VS Code MCP configs.

Expected shape:

```txt
Inspecting tare-live-http-example via streamable-http...

tare-mcp — MCP context weight

Config files found: 1
Servers analyzed: 1
Inspection mode: live default
Tools exposed: 2
```
