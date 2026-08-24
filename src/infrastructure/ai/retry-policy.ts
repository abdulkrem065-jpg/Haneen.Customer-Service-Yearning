export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  jitter: true,
};

/**
  Checks if an error is transient and retriable (429, 503, timeout, network glitch)
  vs permanent (400, 401, 403, 404).
 */
export function isRetriableError(error: unknown): boolean {
  if (!error) return false;

  const rawMsg = error instanceof Error ? error.message : String(error);
  const status = (error as any)?.status || (error as any)?.statusCode || (error as any)?.code;
  const msg = rawMsg.toUpperCase();

  // 1. Permanent Non-Retriable Errors (400, 401, 403, 404, Auth, Bad Request)
  if (
    status === 400 || status === 401 || status === 403 || status === 404 ||
    /\b400\b/.test(rawMsg) || /\b401\b/.test(rawMsg) || /\b403\b/.test(rawMsg) || /\b404\b/.test(rawMsg) ||
    msg.includes('INVALID_ARGUMENT') ||
    msg.includes('UNAUTHENTICATED') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('NOT_FOUND') ||
    msg.includes('AUTHENTICATION ERROR') ||
    msg.includes('API KEY')
  ) {
    return false;
  }

  // 2. Transient Retriable Errors (429, 503, 502, 504, Timeout, Unavailable, Quota)
  if (
    status === 429 || status === 503 || status === 502 || status === 504 ||
    /\b429\b/.test(rawMsg) || /\b503\b/.test(rawMsg) || /\b502\b/.test(rawMsg) || /\b504\b/.test(rawMsg) ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('RATE LIMIT') ||
    msg.includes('QUOTA') ||
    msg.includes('TOO MANY REQUESTS') ||
    msg.includes('SERVICE UNAVAILABLE') ||
    msg.includes('TIMEOUT') ||
    msg.includes('DEADLINE') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNRESET') ||
    msg.includes('NETWORK_ERROR') ||
    msg.includes('FETCH_ERROR')
  ) {
    return true;
  }

  return false;
}

/**
 * Calculates exponential backoff delay with optional jitter and a max delay cap.
 */
export function calculateBackoffDelay(attempt: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): number {
  const expDelay = config.baseDelayMs * Math.pow(2, attempt - 1);
  const cappedDelay = Math.min(expDelay, config.maxDelayMs);

  if (config.jitter) {
    // Add random jitter between 0 and 0.5 * cappedDelay
    const jitterAmount = Math.random() * 0.5 * cappedDelay;
    return Math.floor(cappedDelay + jitterAmount);
  }

  return cappedDelay;
}

/**
 * Executes an async operation with exponential backoff retry policy.
 */
export async function executeWithRetry<T>(
  fn: (attempt: number) => Promise<T>,
  customConfig?: Partial<RetryConfig>,
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
): Promise<T> {
  const config: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...customConfig };
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err: unknown) {
      lastError = err;

      const retriable = isRetriableError(err);
      if (!retriable || attempt >= config.maxAttempts) {
        throw err;
      }

      const delayMs = calculateBackoffDelay(attempt, config);
      if (onRetry) {
        onRetry(err, attempt, delayMs);
      }

      await new Promise(res => setTimeout(res, delayMs));
    }
  }

  throw lastError;
}
