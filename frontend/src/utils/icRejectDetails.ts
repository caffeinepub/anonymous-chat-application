/**
 * Utility to extract and normalize IC reject_code/reject_message from unknown error shapes.
 * Handles nested structures (error/cause) and various IC agent error formats.
 */

export interface ICRejectDetails {
  code?: string;
  message?: string;
}

/**
 * Extract reject details from IC agent errors, checking multiple nested levels
 */
export function extractICRejectDetails(error: unknown): ICRejectDetails {
  if (!error || typeof error !== 'object') {
    return {};
  }

  const err = error as Record<string, unknown>;
  
  // Direct reject properties
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
    // Recursively check deeper nesting
    const deeperResult = extractICRejectDetails(nested);
    if (deeperResult.code || deeperResult.message) {
      return deeperResult;
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
    // Recursively check deeper nesting
    const deeperResult = extractICRejectDetails(cause);
    if (deeperResult.code || deeperResult.message) {
      return deeperResult;
    }
  }

  return {};
}

/**
 * Get all candidate error messages from an error object
 */
export function getCandidateMessages(error: unknown): string[] {
  const messages: string[] = [];

  if (!error) {
    return messages;
  }

  // Standard Error.message
  if (error instanceof Error && error.message) {
    messages.push(error.message);
  }

  // String error
  if (typeof error === 'string') {
    messages.push(error);
  }

  // IC reject_message
  const rejectDetails = extractICRejectDetails(error);
  if (rejectDetails.message) {
    messages.push(rejectDetails.message);
  }

  // Check for message property in object
  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;
    if ('message' in err && typeof err.message === 'string') {
      messages.push(err.message);
    }
  }

  return messages;
}
