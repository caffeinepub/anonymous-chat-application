import { extractICRejectDetails, getCandidateMessages } from './icRejectDetails';

/**
 * Sanitizes backend and network errors into anonymous, nickname-based, user-friendly messages.
 * Removes any references to "users", "login", "authentication", or "Internet Identity".
 * Prioritizes IC reject_message over generic error stringification.
 */
export function sanitizeChatError(error: unknown): string {
  if (!error) {
    return 'An unexpected error occurred';
  }

  // Get all candidate error messages (Error.message, reject_message, etc.)
  const candidateMessages = getCandidateMessages(error);
  
  // Try to find a specific actionable message from candidates
  for (const errorMessage of candidateMessages) {
    const lowerMessage = errorMessage.toLowerCase();

    // Nickname validation errors
    if (lowerMessage.includes('nickname cannot be empty')) {
      return 'Nickname cannot be empty';
    }

    if (lowerMessage.includes('nickname cannot exceed 20 characters')) {
      return 'Nickname cannot exceed 20 characters';
    }

    // Room code validation errors
    if (lowerMessage.includes('room join code cannot be empty') || 
        lowerMessage.includes('room code cannot be empty')) {
      return 'Room code cannot be empty';
    }

    if (lowerMessage.includes('room join code cannot exceed 30 characters') ||
        lowerMessage.includes('room code cannot exceed 30 characters')) {
      return 'Room code cannot exceed 30 characters';
    }

    // Room existence errors (specific backend traps)
    if (lowerMessage.includes('cannot send message: room does not exist') || 
        lowerMessage.includes('room does not exist')) {
      return 'Room does not exist. Please check the room code.';
    }

    if (lowerMessage.includes('room already exists')) {
      return 'Room already exists. Please use Join Room.';
    }

    // Authorization errors - map to specific anonymized messages
    if (lowerMessage.includes('unauthorized: only users can send messages')) {
      return 'Unable to send message. Please try again.';
    }

    if (lowerMessage.includes('unauthorized: only users can create rooms')) {
      return 'Unable to create room. Please try again or join an existing room.';
    }

    if (lowerMessage.includes('unauthorized: only users can view messages') ||
        lowerMessage.includes('unauthorized: only users can access')) {
      return 'Unable to access room. Please check the room code.';
    }

    if (lowerMessage.includes('unauthorized: only users can edit messages') ||
        lowerMessage.includes('unauthorized: only users can delete messages')) {
      return 'You can only modify your own messages';
    }

    if (lowerMessage.includes('unauthorized: only users can add reactions') ||
        lowerMessage.includes('unauthorized: only users can remove reactions')) {
      return 'Unable to update reaction. Please try again.';
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

    if (lowerMessage.includes('whitespace only')) {
      return 'Input cannot be empty or whitespace only.';
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
  }

  // Default fallback for unknown errors (only when no actionable message found)
  return 'An error occurred. Please try again.';
}
