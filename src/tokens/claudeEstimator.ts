import type { TokenCounter, TokenEstimate } from "./types.js";

export class LocalClaudeEstimator implements TokenCounter {
  constructor(private readonly openAiCount?: () => Promise<TokenEstimate>) {}

  async count(text: string): Promise<TokenEstimate> {
    const openAiEstimate = await this.openAiCount?.();

    if (openAiEstimate?.confidence !== "low") {
      return {
        tokenizer: "claude-estimate",
        tokens: Math.ceil((openAiEstimate?.tokens ?? Math.ceil(text.length / 4)) * 1.1),
        confidence: "medium",
        warning:
          "Using local Claude approximation. Use --claude-tokenizer api for API-backed token counting."
      };
    }

    return {
      tokenizer: "claude-estimate",
      tokens: Math.ceil(text.length / 4),
      confidence: "low",
      warning:
        "Using low-confidence local Claude approximation because OpenAI cl100k estimate was unavailable."
    };
  }
}
