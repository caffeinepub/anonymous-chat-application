import { extractICRejectDetails } from './icRejectDetails';

const KNOWN_BACKEND_TRAPS: Record<string, string> = {
  'Unauthorized: Only users can create rooms': 'Please login to create a room',
  'Unauthorized: Only users can view messages': 'Please login to view messages',
  'Unauthorized: Only users can send messages': 'Please login to send messages',
  'Unauthorized: Only users can edit messages': 'Please login to edit messages',
  'Unauthorized: Only users can delete messages': 'Please login to delete messages',
  'Unauthorized: Only users can add reactions': 'Please login to add reactions',
  'Unauthorized: Only users can remove reactions': 'Please login to remove reactions',
  'Unauthorized: Only users can access profiles': 'Please login to access profiles',
  'Unauthorized: Only users can save profiles': 'Please login to save your profile',
  'Nickname cannot be empty': 'Please enter a nickname',
  'Nickname cannot exceed 20 characters': 'Nickname is too long (max 20 characters)',
  'Room join code cannot be empty': 'Please enter a room code',
  'Room join code cannot exceed 30 characters': 'Room code is too long (max 30 characters)',
  'Room already exists': 'This room code is already taken. Please choose another one.',
  'Actor not initialized': 'Connection not ready. Please wait a moment and try again.',
  'Actor not available': 'Connection not ready. Please wait a moment and try again.',
};

export function getChatErrorMessage(error: unknown): string {
  const { message: rejectMessage } = extractICRejectDetails(error);

  if (rejectMessage) {
    for (const [trapString, userMessage] of Object.entries(KNOWN_BACKEND_TRAPS)) {
      if (rejectMessage.includes(trapString)) {
        return userMessage;
      }
    }

    if (rejectMessage.includes('Unauthorized')) {
      return 'You need to login to perform this action';
    }

    if (rejectMessage.includes('Room')) {
      return 'Room operation failed. Please check the room code and try again.';
    }

    if (rejectMessage.includes('Nickname')) {
      return 'Invalid nickname. Please check and try again.';
    }

    return 'Operation failed. Please try again.';
  }

  if (error instanceof Error) {
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return 'Network error. Please check your connection and try again.';
    }
  }

  return 'An unexpected error occurred. Please try again.';
}
