import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function fixturePath(name: string): string {
  return path.join(import.meta.dirname, "fixtures", name);
}

export async function tempDir(prefix = "tare-test-"): Promise<{
  path: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    path: dir,
    cleanup: () => rm(dir, { recursive: true, force: true })
  };
}

export async function readMaybe(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

export async function eventually(
  assertion: () => void | Promise<void>,
  timeoutMs = 1000
): Promise<void> {
  const start = Date.now();
  let lastError: unknown;

  while (Date.now() - start < timeoutMs) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  throw lastError;
}
