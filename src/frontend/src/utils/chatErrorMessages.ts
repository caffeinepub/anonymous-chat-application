/**
 * Sanitizes backend and network errors into anonymous, nickname-based, user-friendly messages.
 * Removes any references to "users", "login", "authentication", or "Internet Identity".
 */
export function sanitizeChatError(error: unknown): string {
  if (!error) {
    return 'An unexpected error occurred';
  }

  let errorMessage = '';
  
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else {
    errorMessage = String(error);
  }

  // Normalize common error patterns to anonymous-friendly messages
  const lowerMessage = errorMessage.toLowerCase();

  // Room-specific authorization errors (create, view, join, send operations)
  if (
    (lowerMessage.includes('unauthorized') || lowerMessage.includes('only users can')) &&
    (lowerMessage.includes('create') || 
     lowerMessage.includes('room') || 
     lowerMessage.includes('view') || 
     lowerMessage.includes('join') || 
     lowerMessage.includes('send'))
  ) {
    if (lowerMessage.includes('create')) {
      return 'Unable to create room. Please try again or join an existing room.';
    }
    if (lowerMessage.includes('view') || lowerMessage.includes('join')) {
      return 'Unable to access room. Please check the room code.';
    }
    if (lowerMessage.includes('send')) {
      return 'Unable to send message. Please try again.';
    }
    return 'Unable to perform room operation. Please try again.';
  }

  // Message-ownership authorization errors (edit, delete, modify own messages)
  if (
    (lowerMessage.includes('unauthorized') || lowerMessage.includes('only users can')) &&
    (lowerMessage.includes('edit') || 
     lowerMessage.includes('delete') || 
     lowerMessage.includes('modify') ||
     lowerMessage.includes('own message'))
  ) {
    return 'You can only modify your own messages';
  }

  // Generic authorization/authentication errors (fallback)
  if (
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('authentication') ||
    lowerMessage.includes('login') ||
    lowerMessage.includes('identity')
  ) {
    return 'Permission denied. Please try again.';
  }

  // Connection/network errors
  if (
    lowerMessage.includes('connection not ready') ||
    lowerMessage.includes('actor not') ||
    lowerMessage.includes('not initialized')
  ) {
    return 'Connection not ready. Please wait and try again.';
  }

  if (
    lowerMessage.includes('network') ||
    lowerMessage.includes('fetch') ||
    lowerMessage.includes('timeout')
  ) {
    return 'Network error. Please check your connection and try again.';
  }

  // Room errors
  if (lowerMessage.includes('room does not exist')) {
    return 'Room does not exist. Please check the room code.';
  }

  if (lowerMessage.includes('room already exists')) {
    return 'Room code already exists. Please choose a different code.';
  }

  if (
    lowerMessage.includes('room join code cannot be empty') ||
    lowerMessage.includes('cannot be empty') ||
    lowerMessage.includes('whitespace only')
  ) {
    return 'Room code cannot be empty. Please enter a valid code.';
  }

  // Upload errors
  if (
    lowerMessage.includes('upload') ||
    lowerMessage.includes('uploading')
  ) {
    return 'Please wait for upload to complete';
  }

  // Message operation errors
  if (lowerMessage.includes('failed to send')) {
    return 'Failed to send message. Please try again.';
  }

  if (lowerMessage.includes('failed to edit')) {
    return 'Failed to edit message. Please try again.';
  }

  if (lowerMessage.includes('failed to delete')) {
    return 'Failed to delete message. Please try again.';
  }

  if (lowerMessage.includes('failed to add reaction') || lowerMessage.includes('failed to remove reaction')) {
    return 'Failed to update reaction. Please try again.';
  }

  if (lowerMessage.includes('failed to verify')) {
    return 'Room creation verification failed. Please try joining the room instead.';
  }

  // Validation errors - pass through as-is if they're user-friendly
  if (
    lowerMessage.includes('required') ||
    lowerMessage.includes('invalid') ||
    lowerMessage.includes('must be')
  ) {
    return errorMessage;
  }

  // Default fallback for unknown errors
  return 'An error occurred. Please try again.';
}
