export function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableValue(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, stableValue(record[key])])
    );
  }

  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value), null, 2);
}
