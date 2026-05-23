import type { TareReport } from "../analysis/types.js";

export function renderJsonReport(report: TareReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
