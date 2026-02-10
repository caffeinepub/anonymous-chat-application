import { extractICRejectDetails } from './icRejectDetails';

export interface ChatOperationError {
  operation: string;
  context: Record<string, any>;
  sanitizedMessage: string;
  rawError: unknown;
  icRejectDetails?: {
    code?: string;
    message?: string;
  };
}

export function createChatOperationError(
  operation: string,
  context: Record<string, any>,
  sanitizedMessage: string,
  rawError: unknown
): ChatOperationError {
  const icRejectDetails = extractICRejectDetails(rawError);
  
  return {
    operation,
    context,
    sanitizedMessage,
    rawError,
    icRejectDetails,
  };
}

export function logChatOperationError(error: ChatOperationError): void {
  console.group(`❌ Chat Operation Failed: ${error.operation}`);
  console.log('Context:', error.context);
  console.log('User Message:', error.sanitizedMessage);
  
  if (error.icRejectDetails) {
    console.log('IC Reject Details:', error.icRejectDetails);
  }
  
  console.log('Raw Error:', error.rawError);
  console.groupEnd();
}

/**
 * Log safe operation failure without sensitive user content
 * Used for diagnostics that should not include nicknames, message content, etc.
 */
export function logSafeOperationFailure(
  operation: string,
  safeContext: Record<string, any>,
  error: unknown
): void {
  const icRejectDetails = extractICRejectDetails(error);
  
  console.group(`⚠️ Operation Failed: ${operation}`);
  console.log('Safe Context:', safeContext);
  
  if (icRejectDetails) {
    console.log('IC Reject Details:', icRejectDetails);
  }
  
  console.log('Error:', error);
  console.groupEnd();
}
