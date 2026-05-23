import { hashText } from "../utils/hash.js";
import type { TokenEstimate } from "./types.js";

export class TokenCache {
  private readonly cache = new Map<string, Promise<TokenEstimate>>();

  getOrSet(
    keyPrefix: string,
    text: string,
    count: () => Promise<TokenEstimate>
  ): Promise<TokenEstimate> {
    const key = `${keyPrefix}:${hashText(text)}`;
    const existing = this.cache.get(key);

    if (existing) {
      return existing;
    }

    const estimate = count();
    this.cache.set(key, estimate);
    return estimate;
  }
}
