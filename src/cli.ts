import { Command } from "commander";
import { VERSION } from "./version.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("tare")
    .description(
      [
        "Analyze MCP context weight and tool ambiguity.",
        "",
        "MCP made tools easy to connect. It did not make them cheap to carry."
      ].join("\n")
    )
    .version(VERSION)
    .option("--no-exec", "Static-only mode. Does not spawn MCP servers or call hosted MCP URLs.")
    .option("--timeout <ms>", "Live inspection timeout per server. Default: 5000.", "5000")
    .option("--budget <tokens>", "Fail if estimated context weight exceeds budget.")
    .option("--tokenizer <name>", "Budget tokenizer: claude or openai. Default: claude.", "claude")
    .option("--json", "Output JSON report.")
    .option("--claude-tokenizer <mode>", "Claude tokenizer mode: local or api. Default: local.", "local")
    .action(() => {
      program.error("tare v0.1 implementation is still initializing.", { exitCode: 1 });
    });

  return program;
}

createProgram().parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
