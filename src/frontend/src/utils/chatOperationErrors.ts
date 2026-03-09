import { extractICRejectDetails } from "./icRejectDetails";

export interface ChatOperationError {
  operation: string;
  timestamp: number;
  rejectCode?: string;
  rejectMessage?: string;
  errorType?: string;
  errorMessage?: string;
}

export function logOperationError(
  operation: string,
  error: unknown,
): ChatOperationError {
  const { code: rejectCode, message: rejectMessage } =
    extractICRejectDetails(error);

  const errorLog: ChatOperationError = {
    operation,
    timestamp: Date.now(),
    rejectCode,
    rejectMessage,
    errorType: error instanceof Error ? error.constructor.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
  };

  console.error(`[ChatOperation:${operation}]`, {
    ...errorLog,
    fullError: error,
  });

  return errorLog;
}
