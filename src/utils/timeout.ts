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

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      void Promise.resolve(onTimeout?.()).finally(() => {
        reject(new TimeoutError(`Timed out after ${timeoutMs}ms`, timeoutMs));
      });
    }, timeoutMs);
  });

  try {
    return await Promise.race([work, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export function formatTimeout(timeoutMs: number): string {
  if (timeoutMs % 1000 === 0) {
    return `${timeoutMs / 1000}s`;
  }

  return `${timeoutMs}ms`;
}
