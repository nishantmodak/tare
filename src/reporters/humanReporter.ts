import pc from "picocolors";
import type { TareReport } from "../analysis/types.js";

export type BudgetTokenizer = "claude" | "openai";

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function approx(value: number): string {
  return `~${formatNumber(value)}`;
}

function padRight(text: string, length: number): string {
  return text.padEnd(length, " ");
}

function allTools(report: TareReport): Array<{
  server: string;
  name: string;
  estimatedTokens: { claude: number; openaiCl100k: number };
}> {
  return report.servers.flatMap((server) =>
    server.tools.map((tool) => ({
      server: server.name,
      name: tool.name,
      estimatedTokens: tool.estimatedTokens
    }))
  );
}

export function renderHumanReport(report: TareReport): string {
  const lines: string[] = [];

  lines.push(pc.bold("tare-mcp — MCP context weight"));
  lines.push("");
  lines.push("MCP made tools easy to connect. It did not make them cheap to carry.");
  lines.push("");

  if (report.metadata.staticOnly) {
    lines.push(pc.yellow("Static-only mode: insufficient for packaged or hosted MCP servers."));
    lines.push("Run without --no-exec for actual tool/schema weight.");
    lines.push("");
  }

  for (const warning of report.warnings) {
    lines.push(pc.yellow(`⚠ ${warning}`));
  }

  if (report.warnings.length > 0) {
    lines.push("");
  }

  lines.push(`Config files found: ${report.summary.configFiles}`);
  lines.push(`Servers analyzed: ${report.summary.servers}`);
  lines.push(`Inspection mode: ${report.metadata.inspectionMode}`);
  lines.push(`Tools exposed: ${report.summary.tools}`);
  lines.push("");
  lines.push("Estimated context weight:");
  lines.push(`- Claude estimate:        ${approx(report.summary.estimatedTokens.claude)} tokens`);
  lines.push(
    `- OpenAI cl100k estimate: ${approx(report.summary.estimatedTokens.openaiCl100k)} tokens`
  );
  lines.push("");
  lines.push("Context window usage:");
  lines.push(`- 200k window: ${report.summary.contextWindows["200000"].claude}%`);
  lines.push(`- 128k window: ${report.summary.contextWindows["128000"].claude}%`);
  lines.push(`- 64k window: ${report.summary.contextWindows["64000"].claude}%`);

  if (report.servers.length > 0) {
    lines.push("");
    lines.push("Worst servers:");
    for (const [index, server] of report.servers.slice(0, 5).entries()) {
      lines.push(
        `${index + 1}. ${padRight(server.name, 12)} ${padRight(
          `${approx(server.estimatedTokens.claude)} Claude tokens`,
          24
        )} ${server.toolCount.toString().padStart(4)} tools`
      );
    }
  }

  const tools = allTools(report).sort(
    (a, b) => b.estimatedTokens.claude - a.estimatedTokens.claude
  );
  if (tools.length > 0) {
    lines.push("");
    lines.push("Worst tools:");
    for (const [index, tool] of tools.slice(0, 5).entries()) {
      lines.push(
        `${index + 1}. ${padRight(`${tool.server}.${tool.name}`, 34)} ${approx(
          tool.estimatedTokens.claude
        )} Claude tokens`
      );
    }
  }

  if (report.overlapClusters.length > 0) {
    lines.push("");
    lines.push(`Overlap warnings: ${report.overlapClusters.length} clusters`);
    lines.push("");

    for (const [index, cluster] of report.overlapClusters.slice(0, 5).entries()) {
      lines.push(`${index + 1}. ${cluster.label}`);
      for (const tool of cluster.tools) {
        lines.push(`   ${tool.server}.${tool.name}`);
      }
      lines.push(`   → ${cluster.recommendation}`);
      if (index < Math.min(report.overlapClusters.length, 5) - 1) {
        lines.push("");
      }
    }
  }

  const insufficientServers = report.servers.filter((server) => server.inspectionMode !== "live");
  if (insufficientServers.length > 0) {
    lines.push("");
    lines.push("Insufficient data:");
    for (const server of insufficientServers) {
      lines.push(
        `- ${server.name}: ${server.warnings[0] ?? "static fallback cannot see actual tool schemas."}`
      );
    }
  }

  lines.push("");
  lines.push("Recommendations:");
  for (const recommendation of report.recommendations) {
    lines.push(`- ${recommendation.message}`);
  }

  return `${lines.join("\n")}\n`;
}

export function budgetActual(report: TareReport, tokenizer: BudgetTokenizer): number {
  return tokenizer === "openai"
    ? report.summary.estimatedTokens.openaiCl100k
    : report.summary.estimatedTokens.claude;
}

export function renderBudgetFailure(
  report: TareReport,
  budget: number,
  tokenizer: BudgetTokenizer
): string {
  const actual = budgetActual(report, tokenizer);
  const label =
    tokenizer === "openai" ? "OpenAI cl100k-estimated tokens" : "Claude-estimated tokens";
  const lines: string[] = [];

  lines.push("");
  lines.push(pc.red(pc.bold("FAILED: MCP context budget exceeded.")));
  lines.push("");
  lines.push(`Budget: ${formatNumber(budget)} ${label}`);
  lines.push(`Actual: ${approx(actual)} ${label}`);
  lines.push(`Over by: ${approx(actual - budget)} tokens`);

  if (report.servers.length > 0) {
    lines.push("");
    lines.push("Top offenders:");
    for (const [index, server] of report.servers.slice(0, 3).entries()) {
      const tokens =
        tokenizer === "openai"
          ? server.estimatedTokens.openaiCl100k
          : server.estimatedTokens.claude;
      lines.push(`${index + 1}. ${padRight(server.name, 12)} ${approx(tokens)} tokens`);
    }
  }

  const largestCluster = report.overlapClusters[0];
  if (largestCluster) {
    lines.push("");
    lines.push("Largest overlap cluster:");
    lines.push(largestCluster.label);
    for (const tool of largestCluster.tools) {
      lines.push(`- ${tool.server}.${tool.name}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
