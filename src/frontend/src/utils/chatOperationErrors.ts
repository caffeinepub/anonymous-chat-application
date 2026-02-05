/**
 * Structured error wrapper for chat operations that carries both:
 * - A sanitized message for UI display
 * - The raw underlying error for console diagnostics
 */
export interface ChatOperationError {
  operation: string;
  context: Record<string, unknown>;
  sanitizedMessage: string;
  rawError: unknown;
}

/**
 * Extract reject code and message from IC agent errors
 */
function extractRejectDetails(error: unknown): { code?: string; message?: string } {
  if (!error || typeof error !== 'object') {
    return {};
  }

  const err = error as Record<string, unknown>;
  
  // Check for IC agent reject structure
  if ('reject_code' in err || 'reject_message' in err) {
    return {
      code: err.reject_code ? String(err.reject_code) : undefined,
      message: err.reject_message ? String(err.reject_message) : undefined,
    };
  }

  // Check nested error property
  if ('error' in err && err.error && typeof err.error === 'object') {
    const nested = err.error as Record<string, unknown>;
    if ('reject_code' in nested || 'reject_message' in nested) {
      return {
        code: nested.reject_code ? String(nested.reject_code) : undefined,
        message: nested.reject_message ? String(nested.reject_message) : undefined,
      };
    }
  }

  // Check for cause property (common in wrapped errors)
  if ('cause' in err && err.cause && typeof err.cause === 'object') {
    const cause = err.cause as Record<string, unknown>;
    if ('reject_code' in cause || 'reject_message' in cause) {
      return {
        code: cause.reject_code ? String(cause.reject_code) : undefined,
        message: cause.reject_message ? String(cause.reject_message) : undefined,
      };
    }
  }

  return {};
}

/**
 * Classify if an error is transient based on reject code or message
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
  const rejectDetails = extractRejectDetails(error);
  if (rejectDetails.code) {
    const code = rejectDetails.code;
    // SYS_TRANSIENT (1), SYS_UNKNOWN (2) are potentially transient
    if (code === '1' || code === '2') {
      return true;
    }
  }

  return false;
}

/**
 * Emit a structured console log for chat operation failures.
 * Includes operation name, context, sanitized message, and raw error details.
 */
export function logChatOperationError(error: ChatOperationError): void {
  const { operation, context, sanitizedMessage, rawError } = error;
  
  const rejectDetails = extractRejectDetails(rawError);
  
  console.group(`[Chat Operation Failed] ${operation}`);
  console.log('Context:', context);
  console.log('User-facing message:', sanitizedMessage);
  
  if (rejectDetails.code || rejectDetails.message) {
    console.log('IC Reject Details:', rejectDetails);
  }
  
  console.log('Raw error:', rawError);
  
  // Log stack trace if available
  if (rawError instanceof Error && rawError.stack) {
    console.log('Stack trace:', rawError.stack);
  }
  
  console.groupEnd();
}

/**
 * Create a ChatOperationError from a raw error
 */
export function createChatOperationError(
  operation: string,
  context: Record<string, unknown>,
  sanitizedMessage: string,
  rawError: unknown
): ChatOperationError {
  return {
    operation,
    context,
    sanitizedMessage,
    rawError,
  };
}
