import type { ClaudeTokenizerMode, DualTokenEstimate, TokenEstimate } from "./types.js";
import { LocalClaudeEstimator } from "./claudeEstimator.js";
import { OpenAICl100kCounter } from "./openaiCl100kCounter.js";
import { TokenCache } from "./tokenCache.js";

type CountTokensOptions = {
  claudeTokenizerMode: ClaudeTokenizerMode;
  anthropicApiKey?: string;
  anthropicModel?: string;
  anthropicDisabled?: boolean;
  timeoutMs?: number;
  onWarning?: (warning: string) => void;
};

type QueueTask<T> = {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

class PromiseQueue {
  private active = 0;
  private readonly tasks: Array<QueueTask<unknown>> = [];

  constructor(private readonly concurrency: number) {}

  push<T>(run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.tasks.push({ run, resolve: resolve as (value: unknown) => void, reject });
      this.drain();
    });
  }

  private drain(): void {
    while (this.active < this.concurrency && this.tasks.length > 0) {
      const task = this.tasks.shift();
      if (!task) {
        return;
      }

      this.active += 1;
      void task
        .run()
        .then(task.resolve)
        .catch(task.reject)
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }
}

export class TokenEstimator {
  private readonly cache = new TokenCache();
  private readonly openAiCounter = new OpenAICl100kCounter();
  private readonly anthropicQueue = new PromiseQueue(3);
  private anthropicApiUnavailable = false;
  private emittedMissingKeyWarning = false;
  private emittedDisabledWarning = false;
  private emittedApiFailureWarning = false;

  constructor(private readonly options: CountTokensOptions) {}

  async count(text: string): Promise<DualTokenEstimate> {
    const openaiCl100k = await this.cache.getOrSet("openai-cl100k", text, () =>
      this.openAiCounter.count(text)
    );

    const claude = await this.cache.getOrSet(
      `claude:${this.options.claudeTokenizerMode}`,
      text,
      () => this.countClaude(text, openaiCl100k)
    );

    return { claude, openaiCl100k };
  }

  private async countClaude(text: string, openAiEstimate: TokenEstimate): Promise<TokenEstimate> {
    if (this.options.claudeTokenizerMode !== "api") {
      return new LocalClaudeEstimator(async () => openAiEstimate).count(text);
    }

    if (this.options.anthropicDisabled) {
      if (!this.emittedDisabledWarning) {
        this.options.onWarning?.(
          "Claude API token counting requested but TARE_DISABLE_ANTHROPIC_TOKEN_API=1 is set. Falling back to local Claude approximation."
        );
        this.emittedDisabledWarning = true;
      }
      return new LocalClaudeEstimator(async () => openAiEstimate).count(text);
    }

    if (!this.options.anthropicApiKey) {
      if (!this.emittedMissingKeyWarning) {
        this.options.onWarning?.(
          "Claude API token counting requested but ANTHROPIC_API_KEY is not set. Falling back to local Claude approximation."
        );
        this.emittedMissingKeyWarning = true;
      }
      return new LocalClaudeEstimator(async () => openAiEstimate).count(text);
    }

    if (this.anthropicApiUnavailable) {
      return new LocalClaudeEstimator(async () => openAiEstimate).count(text);
    }

    try {
      return await this.anthropicQueue.push(() => this.countClaudeWithApi(text));
    } catch {
      this.anthropicApiUnavailable = true;
      if (!this.emittedApiFailureWarning) {
        this.options.onWarning?.(
          "Claude API token counting failed. Falling back to local Claude approximation."
        );
        this.emittedApiFailureWarning = true;
      }
      return new LocalClaudeEstimator(async () => openAiEstimate).count(text);
    }
  }

  private async countClaudeWithApi(text: string): Promise<TokenEstimate> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 5000);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "x-api-key": this.options.anthropicApiKey ?? "",
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.options.anthropicModel ?? "claude-sonnet-4-6",
          messages: [
            {
              role: "user",
              content: text
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Anthropic count_tokens failed with ${response.status}`);
      }

      const body = (await response.json()) as { input_tokens?: number; inputTokens?: number };
      const tokens = body.input_tokens ?? body.inputTokens;
      if (typeof tokens !== "number" || !Number.isFinite(tokens)) {
        throw new Error("Anthropic count_tokens response did not include input_tokens.");
      }

      return {
        tokenizer: "claude-api",
        tokens: Math.ceil(tokens),
        confidence: "high"
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
