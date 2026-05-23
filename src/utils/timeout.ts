export class TimeoutError extends Error {
  constructor(
    message: string,
    readonly timeoutMs: number
  ) {
    super(message);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void | Promise<void>
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  let didTimeout = false;
  let cleanup: Promise<void> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      didTimeout = true;
      cleanup = Promise.resolve(onTimeout?.()).then(() => undefined);
      reject(new TimeoutError(`Timed out after ${timeoutMs}ms`, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([work, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    if (didTimeout) {
      await cleanup?.catch(() => undefined);
    }
  }
}

export function formatTimeout(timeoutMs: number): string {
  if (timeoutMs % 1000 === 0) {
    return `${timeoutMs / 1000}s`;
  }

  return `${timeoutMs}ms`;
}
