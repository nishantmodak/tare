# Claude Hook OTLP Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `tare-mcp hook` CLI subcommand that Claude Code users register as a `Stop` hook; it runs the tare-mcp analysis and emits structured OTLP log events (matching the `mcp.tool_surface` pattern) to any OTLP-compatible backend.

**Architecture:** Four focused files under `src/hook/` — stdin reader, log-record builder, OTLP exporter, and command orchestrator — wired into `src/cli.ts` as a `hook` subcommand. No OTel SDK; OTLP HTTP/JSON is hand-crafted with native `fetch`.

**Tech Stack:** TypeScript, Node ≥ 20, vitest, Commander (already in use), native `fetch`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/hook/readHookPayload.ts` | Read Claude Code Stop hook JSON from stdin |
| Create | `src/hook/buildLogRecords.ts` | Convert `TareReport` → OTLP `LogRecord[]` |
| Create | `src/hook/otlpLogExporter.ts` | POST OTLP HTTP/JSON to endpoint |
| Create | `src/hook/hookCommand.ts` | Orchestrate hook: read → analyze → export |
| Modify | `src/cli.ts` | Register `hook` subcommand |
| Create | `src/__tests__/readHookPayload.test.ts` | Unit tests for stdin parsing |
| Create | `src/__tests__/buildLogRecords.test.ts` | Unit tests for log-record builder |
| Create | `src/__tests__/otlpLogExporter.test.ts` | Unit tests for OTLP exporter + header parser |
| Create | `src/__tests__/hookCommand.test.ts` | CLI integration: `hook` subcommand wired |

---

## Task 1: `readHookPayload.ts` — Parse Claude Code stdin

**Files:**
- Create: `src/hook/readHookPayload.ts`
- Create: `src/__tests__/readHookPayload.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/readHookPayload.test.ts
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { readHookPayload } from "../hook/readHookPayload.js";

describe("readHookPayload", () => {
  it("extracts session_id from valid Claude Code Stop payload", async () => {
    const stream = Readable.from(['{"session_id":"abc-123","stop_hook_active":true}']);
    const result = await readHookPayload(stream);
    expect(result.sessionId).toBe("abc-123");
  });

  it("returns empty sessionId when stdin is empty", async () => {
    const stream = Readable.from([""]);
    const result = await readHookPayload(stream);
    expect(result.sessionId).toBe("");
  });

  it("returns empty sessionId when JSON has no session_id", async () => {
    const stream = Readable.from(['{"stop_hook_active":true}']);
    const result = await readHookPayload(stream);
    expect(result.sessionId).toBe("");
  });

  it("returns empty sessionId when stdin is malformed JSON", async () => {
    const stream = Readable.from(["not-json"]);
    const result = await readHookPayload(stream);
    expect(result.sessionId).toBe("");
  });

  it("returns empty sessionId when session_id is not a string", async () => {
    const stream = Readable.from(['{"session_id":42}']);
    const result = await readHookPayload(stream);
    expect(result.sessionId).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- readHookPayload
```

Expected: FAIL — `Cannot find module '../hook/readHookPayload.js'`

- [ ] **Step 3: Implement `readHookPayload.ts`**

```typescript
// src/hook/readHookPayload.ts
import type { Readable } from "node:stream";

type StopHookPayload = {
  session_id?: unknown;
};

export type HookPayload = {
  sessionId: string;
};

export async function readHookPayload(
  stdin: Readable = process.stdin as unknown as Readable
): Promise<HookPayload> {
  try {
    const raw = await drainStream(stdin);
    if (!raw.trim()) return { sessionId: "" };
    const parsed = JSON.parse(raw) as StopHookPayload;
    return {
      sessionId: typeof parsed.session_id === "string" ? parsed.session_id : ""
    };
  } catch {
    return { sessionId: "" };
  }
}

function drainStream(stream: Readable): Promise<string> {
  return new Promise((resolve) => {
    if ((stream as NodeJS.ReadStream).isTTY) {
      resolve("");
      return;
    }
    let data = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      data += chunk;
    });
    stream.on("end", () => resolve(data));
    stream.on("error", () => resolve(""));
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- readHookPayload
```

Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/hook/readHookPayload.ts src/__tests__/readHookPayload.test.ts
git commit -m "feat(hook): add stdin payload reader for Claude Code Stop hook"
```

---

## Task 2: `buildLogRecords.ts` — Convert TareReport to OTLP LogRecords

**Files:**
- Create: `src/hook/buildLogRecords.ts`
- Create: `src/__tests__/buildLogRecords.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/buildLogRecords.test.ts
import { describe, expect, it } from "vitest";
import { buildLogRecords } from "../hook/buildLogRecords.js";
import type { TareReport } from "../analysis/types.js";

function makeReport(overrides: Partial<TareReport> = {}): TareReport {
  return {
    version: "0.3.0",
    generatedAt: "2026-05-25T00:00:00.000Z",
    summary: {
      configFiles: 1,
      servers: 2,
      tools: 10,
      estimatedTokens: { claude: 5000, openaiCl100k: 4800 },
      contextWindows: {
        "64000": { claude: 8, openaiCl100k: 8 },
        "128000": { claude: 4, openaiCl100k: 4 },
        "200000": { claude: 3, openaiCl100k: 2 }
      },
      insufficientServers: 0
    },
    servers: [],
    overlapClusters: [],
    recommendations: [],
    warnings: [],
    metadata: { staticOnly: false, inspectionMode: "live default" },
    ...overrides
  };
}

describe("buildLogRecords", () => {
  it("emits one INFO record when no budget or overlap", () => {
    const records = buildLogRecords(makeReport(), { sessionId: "s1" });
    expect(records).toHaveLength(1);
    expect(records[0].body.stringValue).toBe("mcp.tool_surface");
    expect(records[0].severityText).toBe("INFO");
    expect(records[0].severityNumber).toBe(9);
  });

  it("includes correct mcp.tool_surface attributes", () => {
    const records = buildLogRecords(makeReport(), { sessionId: "s1" });
    const attrs = Object.fromEntries(
      records[0].attributes.map((a) => [a.key, a.value])
    );
    expect(attrs["servers"]).toEqual({ intValue: 2 });
    expect(attrs["tools"]).toEqual({ intValue: 10 });
    expect(attrs["tokens_claude"]).toEqual({ intValue: 5000 });
    expect(attrs["tokens_openai_cl100k"]).toEqual({ intValue: 4800 });
    expect(attrs["overlap_clusters"]).toEqual({ intValue: 0 });
    expect(attrs["budget_exceeded"]).toEqual({ boolValue: false });
    expect(attrs["claude.session_id"]).toEqual({ stringValue: "s1" });
  });

  it("omits budget_tokens when no budget is set", () => {
    const records = buildLogRecords(makeReport(), { sessionId: "" });
    const keys = records[0].attributes.map((a) => a.key);
    expect(keys).not.toContain("budget_tokens");
  });

  it("includes budget_tokens when budget is set", () => {
    const records = buildLogRecords(makeReport(), { sessionId: "", budget: 40000 });
    const attrs = Object.fromEntries(
      records[0].attributes.map((a) => [a.key, a.value])
    );
    expect(attrs["budget_tokens"]).toEqual({ intValue: 40000 });
    expect(attrs["budget_exceeded"]).toEqual({ boolValue: false });
  });

  it("emits budget_exceeded WARN record when tokens exceed budget", () => {
    const report = makeReport();
    // tokens_claude = 5000, budget = 3000
    const records = buildLogRecords(report, { sessionId: "s2", budget: 3000 });
    expect(records).toHaveLength(2);
    expect(records[1].body.stringValue).toBe("mcp.tool_surface.budget_exceeded");
    expect(records[1].severityText).toBe("WARN");
    expect(records[1].severityNumber).toBe(13);
    const attrs = Object.fromEntries(
      records[1].attributes.map((a) => [a.key, a.value])
    );
    expect(attrs["tokens_claude"]).toEqual({ intValue: 5000 });
    expect(attrs["budget_tokens"]).toEqual({ intValue: 3000 });
    expect(attrs["over_by"]).toEqual({ intValue: 2000 });
    expect(attrs["claude.session_id"]).toEqual({ stringValue: "s2" });
  });

  it("emits overlap_detected WARN record when clusters exist", () => {
    const report = makeReport({
      overlapClusters: [
        {
          label: "search intent",
          score: 0.8,
          reason: "shared search intent",
          signals: ["intent-heuristic"],
          tools: [{ server: "a", name: "search" }],
          recommendation: "Prefer one search surface."
        }
      ]
    });
    const records = buildLogRecords(report, { sessionId: "s3" });
    expect(records).toHaveLength(2);
    expect(records[1].body.stringValue).toBe("mcp.tool_surface.overlap_detected");
    expect(records[1].severityText).toBe("WARN");
    const attrs = Object.fromEntries(
      records[1].attributes.map((a) => [a.key, a.value])
    );
    expect(attrs["clusters"]).toEqual({ intValue: 1 });
    expect(attrs["labels"]).toEqual({
      arrayValue: { values: [{ stringValue: "search intent" }] }
    });
    expect(attrs["claude.session_id"]).toEqual({ stringValue: "s3" });
  });

  it("emits all three records when budget exceeded and overlap exists", () => {
    const report = makeReport({
      overlapClusters: [
        {
          label: "issue creation",
          score: 0.9,
          reason: "shared create intent",
          signals: ["intent-heuristic"],
          tools: [{ server: "a", name: "create_issue" }],
          recommendation: "Use task-specific profiles."
        }
      ]
    });
    const records = buildLogRecords(report, { sessionId: "s4", budget: 3000 });
    expect(records).toHaveLength(3);
    expect(records[0].body.stringValue).toBe("mcp.tool_surface");
    expect(records[1].body.stringValue).toBe("mcp.tool_surface.budget_exceeded");
    expect(records[2].body.stringValue).toBe("mcp.tool_surface.overlap_detected");
  });

  it("omits claude.session_id attribute when sessionId is empty", () => {
    const records = buildLogRecords(makeReport(), { sessionId: "" });
    const keys = records[0].attributes.map((a) => a.key);
    expect(keys).not.toContain("claude.session_id");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- buildLogRecords
```

Expected: FAIL — `Cannot find module '../hook/buildLogRecords.js'`

- [ ] **Step 3: Implement `buildLogRecords.ts`**

```typescript
// src/hook/buildLogRecords.ts
import type { TareReport } from "../analysis/types.js";

type OtlpStringValue = { stringValue: string };
type OtlpIntValue = { intValue: number };
type OtlpBoolValue = { boolValue: boolean };
type OtlpArrayValue = { arrayValue: { values: OtlpAnyValue[] } };
type OtlpAnyValue = OtlpStringValue | OtlpIntValue | OtlpBoolValue | OtlpArrayValue;

export type OtlpAttribute = { key: string; value: OtlpAnyValue };

export type OtlpLogRecord = {
  timeUnixNano: string;
  severityNumber: number;
  severityText: "INFO" | "WARN";
  body: OtlpStringValue;
  attributes: OtlpAttribute[];
};

export type BuildLogRecordsOptions = {
  sessionId: string;
  budget?: number;
};

export function buildLogRecords(
  report: TareReport,
  options: BuildLogRecordsOptions
): OtlpLogRecord[] {
  const timeUnixNano = String(BigInt(Date.now()) * BigInt(1_000_000));
  const { sessionId, budget } = options;
  const tokensClaude = report.summary.estimatedTokens.claude;
  const budgetExceeded = budget !== undefined && tokensClaude > budget;

  const mainAttrs: OtlpAttribute[] = [
    attr("servers", { intValue: report.summary.servers }),
    attr("tools", { intValue: report.summary.tools }),
    attr("tokens_claude", { intValue: tokensClaude }),
    attr("tokens_openai_cl100k", { intValue: report.summary.estimatedTokens.openaiCl100k }),
    attr("overlap_clusters", { intValue: report.overlapClusters.length }),
    attr("budget_exceeded", { boolValue: budgetExceeded })
  ];
  if (budget !== undefined) {
    mainAttrs.push(attr("budget_tokens", { intValue: budget }));
  }
  if (sessionId) {
    mainAttrs.push(attr("claude.session_id", { stringValue: sessionId }));
  }

  const records: OtlpLogRecord[] = [
    {
      timeUnixNano,
      severityNumber: 9,
      severityText: "INFO",
      body: { stringValue: "mcp.tool_surface" },
      attributes: mainAttrs
    }
  ];

  if (budgetExceeded && budget !== undefined) {
    const warnAttrs: OtlpAttribute[] = [
      attr("tokens_claude", { intValue: tokensClaude }),
      attr("budget_tokens", { intValue: budget }),
      attr("over_by", { intValue: tokensClaude - budget })
    ];
    if (sessionId) warnAttrs.push(attr("claude.session_id", { stringValue: sessionId }));
    records.push({
      timeUnixNano,
      severityNumber: 13,
      severityText: "WARN",
      body: { stringValue: "mcp.tool_surface.budget_exceeded" },
      attributes: warnAttrs
    });
  }

  if (report.overlapClusters.length > 0) {
    const overlapAttrs: OtlpAttribute[] = [
      attr("clusters", { intValue: report.overlapClusters.length }),
      attr("labels", {
        arrayValue: {
          values: report.overlapClusters.map((c) => ({ stringValue: c.label }))
        }
      })
    ];
    if (sessionId) overlapAttrs.push(attr("claude.session_id", { stringValue: sessionId }));
    records.push({
      timeUnixNano,
      severityNumber: 13,
      severityText: "WARN",
      body: { stringValue: "mcp.tool_surface.overlap_detected" },
      attributes: overlapAttrs
    });
  }

  return records;
}

function attr(key: string, value: OtlpAnyValue): OtlpAttribute {
  return { key, value };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- buildLogRecords
```

Expected: PASS — 8 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/hook/buildLogRecords.ts src/__tests__/buildLogRecords.test.ts
git commit -m "feat(hook): add OTLP log-record builder from TareReport"
```

---

## Task 3: `otlpLogExporter.ts` — POST OTLP HTTP/JSON

**Files:**
- Create: `src/hook/otlpLogExporter.ts`
- Create: `src/__tests__/otlpLogExporter.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/otlpLogExporter.test.ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { exportOtlpLogs, parseOtlpHeaders } from "../hook/otlpLogExporter.js";
import type { OtlpLogRecord } from "../hook/buildLogRecords.js";

function makeRecord(): OtlpLogRecord {
  return {
    timeUnixNano: "1234567890000000000",
    severityNumber: 9,
    severityText: "INFO",
    body: { stringValue: "mcp.tool_surface" },
    attributes: [{ key: "tools", value: { intValue: 5 } }]
  };
}

describe("parseOtlpHeaders", () => {
  it("parses key=value pairs", () => {
    expect(parseOtlpHeaders("Authorization=Bearer tok")).toEqual({
      Authorization: "Bearer tok"
    });
  });

  it("parses multiple pairs", () => {
    expect(parseOtlpHeaders("Authorization=Bearer tok,X-Tenant=acme")).toEqual({
      Authorization: "Bearer tok",
      "X-Tenant": "acme"
    });
  });

  it("handles value containing equals sign", () => {
    expect(parseOtlpHeaders("Authorization=Basic dXNlcjpwYXNz")).toEqual({
      Authorization: "Basic dXNlcjpwYXNz"
    });
  });

  it("returns empty object for empty string", () => {
    expect(parseOtlpHeaders("")).toEqual({});
  });

  it("skips malformed pairs with no equals sign", () => {
    expect(parseOtlpHeaders("NoEquals,Authorization=Bearer tok")).toEqual({
      Authorization: "Bearer tok"
    });
  });
});

describe("exportOtlpLogs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to OTLP endpoint with /v1/logs appended", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    });

    await exportOtlpLogs([makeRecord()], {
      endpoint: "https://otlp.example.com",
      headers: { Authorization: "Bearer tok" },
      serviceName: "claude-code"
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://otlp.example.com/v1/logs");
    expect((calls[0].init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("strips trailing slash from endpoint before appending /v1/logs", async () => {
    const calls: { url: string }[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push({ url });
      return new Response("{}", { status: 200 });
    });

    await exportOtlpLogs([makeRecord()], {
      endpoint: "https://otlp.example.com/",
      headers: {},
      serviceName: "claude-code"
    });

    expect(calls[0].url).toBe("https://otlp.example.com/v1/logs");
  });

  it("includes resourceLogs envelope with service.name in body", async () => {
    let body = "";
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      body = init.body as string;
      return new Response("{}", { status: 200 });
    });

    await exportOtlpLogs([makeRecord()], {
      endpoint: "https://otlp.example.com",
      headers: {},
      serviceName: "my-service"
    });

    const parsed = JSON.parse(body) as {
      resourceLogs: Array<{
        resource: { attributes: Array<{ key: string; value: { stringValue: string } }> };
        scopeLogs: Array<{ logRecords: OtlpLogRecord[] }>;
      }>;
    };
    const serviceAttr = parsed.resourceLogs[0].resource.attributes.find(
      (a) => a.key === "service.name"
    );
    expect(serviceAttr?.value.stringValue).toBe("my-service");
    expect(parsed.resourceLogs[0].scopeLogs[0].logRecords).toHaveLength(1);
  });

  it("writes warning to stderr on non-200 response and does not throw", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 401 }));
    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((s) => {
      stderrWrites.push(s as string);
      return true;
    });

    await expect(
      exportOtlpLogs([makeRecord()], {
        endpoint: "https://otlp.example.com",
        headers: {},
        serviceName: "claude-code"
      })
    ).resolves.toBeUndefined();

    expect(stderrWrites.some((s) => s.includes("401"))).toBe(true);
  });

  it("writes warning to stderr on network error and does not throw", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNREFUSED");
    });
    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((s) => {
      stderrWrites.push(s as string);
      return true;
    });

    await expect(
      exportOtlpLogs([makeRecord()], {
        endpoint: "https://otlp.example.com",
        headers: {},
        serviceName: "claude-code"
      })
    ).resolves.toBeUndefined();

    expect(stderrWrites.some((s) => s.includes("ECONNREFUSED"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- otlpLogExporter
```

Expected: FAIL — `Cannot find module '../hook/otlpLogExporter.js'`

- [ ] **Step 3: Implement `otlpLogExporter.ts`**

```typescript
// src/hook/otlpLogExporter.ts
import { VERSION } from "../version.js";
import type { OtlpLogRecord } from "./buildLogRecords.js";

export type OtlpExportOptions = {
  endpoint: string;
  headers: Record<string, string>;
  serviceName: string;
  timeoutMs?: number;
};

export async function exportOtlpLogs(
  records: OtlpLogRecord[],
  options: OtlpExportOptions
): Promise<void> {
  const url = `${options.endpoint.replace(/\/$/, "")}/v1/logs`;
  const body = JSON.stringify({
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: options.serviceName } },
            { key: "tare.version", value: { stringValue: VERSION } }
          ]
        },
        scopeLogs: [
          {
            scope: { name: "tare-mcp", version: VERSION },
            logRecords: records
          }
        ]
      }
    ]
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 3000
  );

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...options.headers },
      body,
      signal: controller.signal
    });
    if (!response.ok) {
      process.stderr.write(
        `tare-mcp hook: OTLP export failed (HTTP ${response.status})\n`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`tare-mcp hook: OTLP export error: ${message}\n`);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function parseOtlpHeaders(raw: string): Record<string, string> {
  if (!raw.trim()) return {};
  return Object.fromEntries(
    raw.split(",").flatMap((pair) => {
      const idx = pair.indexOf("=");
      if (idx === -1) return [];
      return [[pair.slice(0, idx).trim(), pair.slice(idx + 1).trim()]];
    })
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- otlpLogExporter
```

Expected: PASS — 10 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/hook/otlpLogExporter.ts src/__tests__/otlpLogExporter.test.ts
git commit -m "feat(hook): add OTLP HTTP/JSON exporter with header parser"
```

---

## Task 4: `hookCommand.ts` — Orchestrate the hook

**Files:**
- Create: `src/hook/hookCommand.ts`

No separate test for this file — it is a thin orchestrator over already-tested units. The CLI wiring test in Task 5 covers it end-to-end.

- [ ] **Step 1: Implement `hookCommand.ts`**

```typescript
// src/hook/hookCommand.ts
import { analyzeServers } from "../analysis/analyze.js";
import { discoverConfigs } from "../discovery/discoverConfigs.js";
import { parseConfigFile } from "../discovery/parseConfig.js";
import { createStaticInspection } from "../inspectors/staticInspector.js";
import { inspectStdioServer } from "../inspectors/stdioMcpInspector.js";
import { inspectStreamableHttpServer } from "../inspectors/streamableHttpMcpInspector.js";
import type { InspectedServer, NormalizedServer } from "../inspectors/types.js";
import { TokenEstimator } from "../tokens/countTokens.js";
import { buildLogRecords } from "./buildLogRecords.js";
import { exportOtlpLogs, parseOtlpHeaders } from "./otlpLogExporter.js";
import { readHookPayload } from "./readHookPayload.js";

export async function runHook(): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    process.stderr.write(
      "tare-mcp hook: OTEL_EXPORTER_OTLP_ENDPOINT is not set, skipping.\n"
    );
    return;
  }

  const headers = parseOtlpHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS ?? "");
  const serviceName = process.env.OTEL_SERVICE_NAME ?? "claude-code";
  const budget = process.env.TARE_HOOK_BUDGET
    ? parseInt(process.env.TARE_HOOK_BUDGET, 10)
    : undefined;

  try {
    const [payload, discovered] = await Promise.all([
      readHookPayload(),
      discoverConfigs()
    ]);

    const parsedConfigs = await Promise.all(
      discovered.paths.map((p) => parseConfigFile(p))
    );
    const servers = parsedConfigs
      .flatMap((c) => c.servers)
      .filter((s) => !s.disabled);

    const inspectedServers: InspectedServer[] = [];
    for (const server of servers) {
      inspectedServers.push(await inspectServerForHook(server));
    }

    const report = await analyzeServers(
      inspectedServers,
      new TokenEstimator({ claudeTokenizerMode: "local" }),
      { configFiles: discovered.paths.length, staticOnly: false }
    );

    const records = buildLogRecords(report, {
      sessionId: payload.sessionId,
      budget
    });

    await exportOtlpLogs(records, { endpoint, headers, serviceName });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`tare-mcp hook: analysis failed: ${message}\n`);
  }
}

async function inspectServerForHook(server: NormalizedServer): Promise<InspectedServer> {
  if (server.transport === "stdio") {
    return inspectStdioServer(server, { timeoutMs: 5000 });
  }
  if (server.transport === "streamable-http" || server.transport === "http") {
    return inspectStreamableHttpServer(server, { timeoutMs: 5000 });
  }
  return createStaticInspection(server, "fallback-static-insufficient", [
    `${server.transport ?? "unknown"} transport is unsupported.`
  ]);
}
```

- [ ] **Step 2: Run the full test suite to ensure nothing broke**

```bash
pnpm test
```

Expected: all existing tests still PASS; new hook tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/hook/hookCommand.ts
git commit -m "feat(hook): add hook command orchestrator"
```

---

## Task 5: Register `hook` subcommand in `src/cli.ts`

**Files:**
- Modify: `src/cli.ts`
- Create: `src/__tests__/hookCommand.test.ts`

- [ ] **Step 1: Write the failing CLI wiring test**

```typescript
// src/__tests__/hookCommand.test.ts
import { spawn } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

type CliResult = { code: number; stdout: string; stderr: string };

function runCli(args: string[], stdinData?: string): Promise<CliResult> {
  const cliPath = path.join(import.meta.dirname, "..", "cli.ts");
  const repoRoot = path.join(import.meta.dirname, "..", "..");
  const child = spawn(process.execPath, ["--import", "tsx", cliPath, ...args], {
    cwd: repoRoot,
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["pipe", "pipe", "pipe"]
  });

  if (stdinData !== undefined) {
    child.stdin.write(stdinData);
    child.stdin.end();
  } else {
    child.stdin.end();
  }

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

describe("tare-mcp hook CLI", () => {
  it("registers hook subcommand — shows in root help", async () => {
    const result = await runCli(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("hook");
  });

  it("hook --help describes the subcommand", async () => {
    const result = await runCli(["hook", "--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: tare-mcp hook");
    expect(result.stdout).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
  });

  it("hook exits 0 and warns when OTEL_EXPORTER_OTLP_ENDPOINT is not set", async () => {
    const result = await runCli(["hook"], '{"session_id":"test-session"}');
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- hookCommand
```

Expected: FAIL — `hook` command not found in CLI

- [ ] **Step 3: Register `hook` subcommand in `src/cli.ts`**

Add this import at the top of `src/cli.ts` (after existing imports):

```typescript
import { runHook } from "./hook/hookCommand.js";
```

Add this block inside `createProgram()`, after the `diff` command block and before `return program`:

```typescript
  program
    .command("hook")
    .description(
      [
        "Emit MCP tool surface telemetry to an OTLP endpoint.",
        "",
        "Register as a Claude Code Stop hook in ~/.claude/settings.json.",
        "Requires OTEL_EXPORTER_OTLP_ENDPOINT to be set.",
        "",
        "Env vars:",
        "  OTEL_EXPORTER_OTLP_ENDPOINT  Base OTLP URL (required)",
        "  OTEL_EXPORTER_OTLP_HEADERS   Auth headers: key=value,key=value",
        "  OTEL_SERVICE_NAME            Resource service name (default: claude-code)",
        "  TARE_HOOK_BUDGET             Token budget for budget_exceeded check"
      ].join("\n")
    )
    .action(async () => {
      await runHook();
    });
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- hookCommand
```

Expected: PASS — 3 tests passing

- [ ] **Step 5: Run the full test suite**

```bash
pnpm test
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts src/__tests__/hookCommand.test.ts
git commit -m "feat(hook): register tare-mcp hook subcommand in CLI"
```

---

## Task 6: Build and smoke-test

- [ ] **Step 1: Build the project**

```bash
pnpm build
```

Expected: no TypeScript errors, `dist/cli.js` updated

- [ ] **Step 2: Verify hook subcommand in built output**

```bash
node dist/cli.js hook --help
```

Expected output contains:
```
Usage: tare-mcp hook [options]

Emit MCP tool surface telemetry to an OTLP endpoint.
```

- [ ] **Step 3: Verify hook exits 0 without endpoint set**

```bash
echo '{"session_id":"smoke-test"}' | node dist/cli.js hook
```

Expected: exits 0, stderr contains `OTEL_EXPORTER_OTLP_ENDPOINT is not set`

- [ ] **Step 4: Verify hook is listed in root help**

```bash
node dist/cli.js --help
```

Expected: `hook` command listed alongside `diff`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "build: rebuild dist after adding hook subcommand"
```

---

## Task 7: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add hook to the use-case table**

In `README.md`, find the use-case table:

```markdown
| Use case                                  | Use                                    |
| ----------------------------------------- | -------------------------------------- |
| Running agent already has tools in memory | `measureTools()`                       |
| Local MCP config audit                    | `npx tare-mcp`                         |
| PR regression checks                      | `tare-mcp --json` plus `tare-mcp diff` |
| Hosted MCP endpoint smoke test            | `npx tare-mcp --timeout 10000`         |
```

Replace with:

```markdown
| Use case                                  | Use                                    |
| ----------------------------------------- | -------------------------------------- |
| Running agent already has tools in memory | `measureTools()`                       |
| Local MCP config audit                    | `npx tare-mcp`                         |
| PR regression checks                      | `tare-mcp --json` plus `tare-mcp diff` |
| Hosted MCP endpoint smoke test            | `npx tare-mcp --timeout 10000`         |
| Claude Code session telemetry             | `tare-mcp hook` (Claude Code hook)     |
```

- [ ] **Step 2: Add a "Claude Code Hook" section**

Add this section to `README.md` after the "CI usage" section and before "Publishing to npm":

```markdown
## Claude Code Hook

Register `tare-mcp hook` as a Claude Code `Stop` hook to automatically emit MCP tool surface telemetry after every session turn.

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

Set environment variables (e.g. in `~/.zshrc`):

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="https://otlp.last9.io"
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <token>"
export TARE_HOOK_BUDGET=40000
```

On every session turn-end, `tare-mcp hook` emits up to three structured OTLP log events:

| Event | Severity | When |
|---|---|---|
| `mcp.tool_surface` | INFO | Always |
| `mcp.tool_surface.budget_exceeded` | WARN | When `TARE_HOOK_BUDGET` is set and exceeded |
| `mcp.tool_surface.overlap_detected` | WARN | When overlap clusters exist |

Events include `claude.session_id` for cross-session correlation. The hook always exits 0 — it never blocks Claude Code.

### Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | yes | — | Base OTLP URL, e.g. `https://otlp.last9.io` |
| `OTEL_EXPORTER_OTLP_HEADERS` | no | — | Auth headers: `key=value,key=value` |
| `OTEL_SERVICE_NAME` | no | `claude-code` | OTel resource service name |
| `TARE_HOOK_BUDGET` | no | — | Token budget for `budget_exceeded` events |
```

- [ ] **Step 3: Update the CLI reference section**

In `README.md`, find the `## CLI` section. Append after the `diff` usage block:

```markdown
```txt
Usage: tare-mcp hook [options]

Emit MCP tool surface telemetry to an OTLP endpoint.
Register as a Claude Code Stop hook in ~/.claude/settings.json.
Requires OTEL_EXPORTER_OTLP_ENDPOINT to be set.

Env vars:
  OTEL_EXPORTER_OTLP_ENDPOINT  Base OTLP URL (required)
  OTEL_EXPORTER_OTLP_HEADERS   Auth headers: key=value,key=value
  OTEL_SERVICE_NAME            Resource service name (default: claude-code)
  TARE_HOOK_BUDGET             Token budget for budget_exceeded check
```
```

- [ ] **Step 4: Update the Roadmap section**

In `README.md`, under `## Roadmap`, add to the `v0.3:` section as a checked item (this feature ships in v0.3):

```markdown
- [x] Claude Code hook (`tare-mcp hook`) for OTLP telemetry on session end
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document tare-mcp hook for Claude Code OTLP telemetry"
```

---

## Self-Review Checklist (for implementer)

Before opening a PR, verify:

- [ ] `pnpm test` passes with no failures
- [ ] `pnpm build` produces no TypeScript errors
- [ ] `echo '{"session_id":"s1"}' | node dist/cli.js hook` exits 0 with OTLP warning in stderr
- [ ] `node dist/cli.js --help` shows `hook` in the command list
- [ ] `node dist/cli.js hook --help` shows `OTEL_EXPORTER_OTLP_ENDPOINT` in the description
