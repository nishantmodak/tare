export type TokenEstimate = {
  tokenizer: "claude-estimate" | "claude-api" | "openai-cl100k" | "fallback-char-ratio";
  tokens: number;
  confidence: "high" | "medium" | "low";
  warning?: string;
};

export interface TokenCounter {
  count(text: string): Promise<TokenEstimate>;
}

export type DualTokenEstimate = {
  claude: TokenEstimate;
  openaiCl100k: TokenEstimate;
};

export type ClaudeTokenizerMode = "local" | "api";
