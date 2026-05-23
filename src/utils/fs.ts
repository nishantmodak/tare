import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function expandHome(input: string, home = os.homedir()): string {
  if (input === "~") {
    return home;
  }

  if (input.startsWith("~/")) {
    return path.join(home, input.slice(2));
  }

  return input;
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readUtf8(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}
