export type HeaderResolution =
  | { ok: true; headers: Record<string, string>; missing: [] }
  | { ok: false; headers: Record<string, string>; missing: string[] };

const ENV_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function resolveHeaderEnv(
  headers: Record<string, string> | undefined,
  env: NodeJS.ProcessEnv = process.env
): HeaderResolution {
  const resolved: Record<string, string> = {};
  const missing = new Set<string>();

  for (const [key, value] of Object.entries(headers ?? {})) {
    resolved[key] = value.replace(ENV_PATTERN, (_match, name: string) => {
      const replacement = env[name];
      if (!replacement) {
        missing.add(name);
        return "";
      }

      return replacement;
    });
  }

  if (missing.size > 0) {
    return { ok: false, headers: resolved, missing: [...missing] };
  }

  return { ok: true, headers: resolved, missing: [] };
}
