import type { TareReport } from "./types.js";

export function buildRecommendations(
  report: Pick<TareReport, "summary" | "overlapClusters" | "servers">
): TareReport["recommendations"] {
  const recommendations: TareReport["recommendations"] = [];

  if (report.servers.some((server) => server.toolCount > 50)) {
    recommendations.push({
      type: "profile",
      message: "Split large MCP servers into task-specific profiles."
    });
  }

  if (report.overlapClusters.length > 0) {
    recommendations.push({
      type: "overlap",
      message: "Avoid exposing multiple tools for the same intent unless needed."
    });
  }

  if (
    report.servers.some((server) =>
      server.tools.some((tool) => /create|update|delete|write|patch/i.test(tool.name))
    )
  ) {
    recommendations.push({
      type: "safety",
      message: "Prefer read-only profiles for common workflows."
    });
  }

  recommendations.push(
    {
      type: "hygiene",
      message: "Disable rarely used write/admin tools."
    },
    {
      type: "budget",
      message: "Use `tare --budget 40000` to enforce a context budget."
    },
    {
      type: "ci",
      message: "Use `tare --json` to track this in CI."
    }
  );

  return recommendations;
}
