import type { TareDiffReport } from "../diff/diffTypes.js";

export function renderDiffJsonReport(report: TareDiffReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
