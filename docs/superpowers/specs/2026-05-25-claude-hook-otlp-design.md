# tare-mcp hook — Claude Code OTLP telemetry

**Date:** 2026-05-25
**Status:** Approved

## Problem

tare-mcp measures the MCP tool surface (token weight, overlap, per-server cost) for agents and CI. Claude Code users have no passive visibility into how much context their MCP configuration consumes per session — they must run `npx tare-mcp` manually.

## Goal

Add a `tare-mcp hook` subcommand that Claude Code users can register as a `Stop` hook. On every session turn-end, it runs the tare-mcp analysis and emits structured OTLP log events to a user-configured observability backend (Last9, Grafana, Honeycomb, or any OTLP-compatible endpoint).

## Data Flow

```
Claude Code (Stop event)
  → writes JSON to stdin: { session_id, transcript_path, stop_hook_active }
  → spawns: tare-mcp hook

tare-mcp hook
  → reads stdin → extracts session_id
  → runs tare-mcp analysis (existing analyzeServers() engine, local-first)
  → builds OTLP LogRecords (1–3 records depending on budget/overlap state)
  → POST /v1/logs to OTEL_EXPORTER_OTLP_ENDPOINT
  → always exits 0 (never blocks Claude Code)
```

## OTLP Log Events

Three event shapes, matching the `mcp.tool_surface` pattern used by Last9's agent SDK (last9/ai#143). The `claude.session_id` attribute is added for cross-session correlation.

**Record 1 — always emitted (INFO)**
```json
{
  "body": "mcp.tool_surface",
  "severity": "INFO",
  "attributes": {
    "servers": 3,
    "tools": 47,
    "tokens_claude": 18400,
    "tokens_openai_cl100k": 17800,
    "overlap_clusters": 2,
    "budget_exceeded": false,
    "budget_tokens": 40000,    // only present when TARE_HOOK_BUDGET is set
    "claude.session_id": "<session_id>"
  }
}
```

**Record 2 — only if budget exceeded (WARN)**
```json
{
  "body": "mcp.tool_surface.budget_exceeded",
  "severity": "WARN",
  "attributes": {
    "tokens_claude": 43200,
    "budget_tokens": 40000,
    "over_by": 3200,
    "claude.session_id": "<session_id>"
  }
}
```

**Record 3 — only if overlap clusters exist (WARN)**
```json
{
  "body": "mcp.tool_surface.overlap_detected",
  "severity": "WARN",
  "attributes": {
    "clusters": 2,
    "labels": ["search intent", "issue creation"],
    "claude.session_id": "<session_id>"
  }
}
```

OTLP envelope uses `resourceLogs` with `service.name` resource attribute. No OTel SDK dependency — payload hand-crafted as OTLP HTTP/JSON, sent via native `fetch` (Node 18+).

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | yes | — | Base URL, e.g. `https://otlp.last9.io` |
| `OTEL_EXPORTER_OTLP_HEADERS` | no | — | Auth headers in `key=value,key=value` format |
| `OTEL_SERVICE_NAME` | no | `claude-code` | OTel resource service name |
| `TARE_HOOK_BUDGET` | no | — | Token budget threshold for `budget_exceeded` |

If `OTEL_EXPORTER_OTLP_ENDPOINT` is not set, the hook logs a warning to stderr and exits 0.

## Implementation Structure

Three new files under `src/hook/`:

**`src/hook/readHookPayload.ts`**
Reads Claude Code's Stop hook JSON from stdin. Returns `{ session_id: string }`. Falls back to `{ session_id: "" }` if stdin is empty or malformed.

**`src/hook/otlpLogExporter.ts`**
Builds the OTLP HTTP/JSON `resourceLogs` envelope. POSTs to `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/logs` — always appends `/v1/logs` to the base URL (users should not include the path in `OTEL_EXPORTER_OTLP_ENDPOINT`). Parses `OTEL_EXPORTER_OTLP_HEADERS` into request headers. 3-second timeout. Returns silently on any network or HTTP error (never throws).

**`src/hook/hookCommand.ts`**
Orchestrates the hook flow:
1. Read stdin via `readHookPayload()`
2. Discover and analyze MCP config via existing `discoverConfigs()` + `analyzeServers()`
3. Build 1–3 log records based on report state
4. Call `otlpLogExporter()`
5. Exit 0 unconditionally

Registered in `src/cli.ts` as the `hook` subcommand alongside `diff`.

## User Setup

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "tare-mcp hook"
          }
        ]
      }
    ]
  }
}
```

Set env vars (e.g. in `~/.zshrc` or `~/.bashrc`):

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="https://otlp.last9.io"
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <token>"
export TARE_HOOK_BUDGET=40000
```

## Error Handling

- Missing `OTEL_EXPORTER_OTLP_ENDPOINT`: warn to stderr, exit 0
- Malformed stdin: fall back to empty `session_id`, continue
- tare-mcp analysis failure: warn to stderr, exit 0
- OTLP HTTP error (any status, network timeout): warn to stderr, exit 0
- Never exit non-zero — a failing hook must not interrupt Claude Code

## What This Enables

Users who already ship `mcp.tool_surface` from production agents (Last9's pattern) get the same structured events from their Claude Code sessions. A single Last9 query or Grafana panel can show:

- MCP context weight trending over time across both dev and prod
- Alerts when `budget_exceeded: true` appears in Claude Code sessions
- Overlap regressions surfaced in dev before they reach production

## Out of Scope

- Per-tool-call measurement (PreToolUse) — too noisy; surface is static within a session
- Trace spans — over-engineered; this is a measurement, not a distributed trace
- Batching / local cache for failed emissions — adds complexity; silent failure on emit error is acceptable
- `tare-mcp --fix` or profile generation — separate roadmap item
