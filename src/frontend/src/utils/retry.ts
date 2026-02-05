/**
 * Retry utility with exponential backoff for transient errors
 */

/**
 * Classify if an error is transient (temporary) and worth retrying
 */
export function isTransientError(error: unknown): boolean {
  if (!error) return false;

  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // Network/connection errors
  if (
    lowerMessage.includes('network') ||
    lowerMessage.includes('fetch') ||
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('connection') ||
    lowerMessage.includes('failed to fetch')
  ) {
    return true;
  }

  // IC replica temporary errors
  if (
    lowerMessage.includes('replica') ||
    lowerMessage.includes('unavailable') ||
    lowerMessage.includes('temporary')
  ) {
    return true;
  }

  // Check for IC reject codes that indicate transient issues
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    const rejectCode = err.reject_code || (err.error as Record<string, unknown>)?.reject_code;
    
    if (rejectCode) {
      const code = String(rejectCode);
      // SYS_TRANSIENT (1), SYS_UNKNOWN (2) are potentially transient
      if (code === '1' || code === '2') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 100,
    maxDelayMs = 2000,
    shouldRetry = isTransientError,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if this is the last attempt
      if (attempt === maxAttempts - 1) {
        throw error;
      }

      // Don't retry if error is not transient
      if (!shouldRetry(error)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs);
      
      console.log(`[Retry] Attempt ${attempt + 1}/${maxAttempts} failed, retrying in ${delay}ms...`, error);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
