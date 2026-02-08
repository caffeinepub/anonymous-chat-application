import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActor } from './useActor';
import type { MessageView, Reaction } from '../backend';
import { ExternalBlob } from '../backend';
import { sanitizeChatError } from '../utils/chatErrorMessages';
import { logChatOperationError, createChatOperationError } from '../utils/chatOperationErrors';
import { retryWithBackoff } from '../utils/retry';
import { toastErrorOnce } from '../utils/toastOnce';

// Generate a unique user ID for the session (stored in localStorage)
function getUserId(): string {
  const stored = localStorage.getItem('chatUserId');
  if (stored) return stored;
  const newId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  localStorage.setItem('chatUserId', newId);
  return newId;
}

// Create a new chat room
export function useCreateRoom() {
  const { actor } = useActor();

  return useMutation({
    mutationFn: async (joinCode: string) => {
      if (!actor) {
        throw new Error('Connection not ready. Please wait for the connection to establish.');
      }
      const trimmedCode = joinCode.trim();
      if (!trimmedCode) {
        throw new Error('Room code cannot be empty');
      }
      if (trimmedCode.length > 30) {
        throw new Error('Room code cannot exceed 30 characters');
      }
      
      // Backend will trap on error, so we just await the result
      const result = await actor.createRoom(trimmedCode);
      return result;
    },
    onError: (error) => {
      console.error('[useCreateRoom] Mutation failed:', error);
    },
  });
}

// Check if room exists using backend roomExists capability
export function useRoomExists(roomId: string | null) {
  const { actor, isFetching: isActorFetching } = useActor();

  return useQuery<boolean>({
    queryKey: ['roomExists', roomId],
    queryFn: async () => {
      if (!actor || !roomId) return false;
      const trimmedRoomId = roomId.trim();
      try {
        const exists = await actor.roomExists(trimmedRoomId);
        return exists;
      } catch (error) {
        // Sanitize error for user display
        const sanitizedError = sanitizeChatError(error);
        
        // Create and log structured error for diagnostics
        const operationError = createChatOperationError(
          'roomExists (query)',
          { 
            roomId: trimmedRoomId,
            actorAvailable: !!actor
          },
          sanitizedError,
          error
        );
        logChatOperationError(operationError);
        
        // Return false to indicate room doesn't exist (safe fallback)
        return false;
      }
    },
    enabled: !!actor && !isActorFetching && !!roomId,
    staleTime: 30000, // Cache for 30 seconds
    retry: 1,
  });
}

// Optimistic message type for instant UI updates
interface OptimisticMessage extends Omit<MessageView, 'id'> {
  id: bigint;
  isOptimistic?: boolean;
  optimisticId?: string;
}

// Send a message with optimistic updates and retry logic
export function useSendMessage() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      roomId, 
      content, 
      nickname, 
      replyToId,
      image,
      video,
      audio
    }: { 
      roomId: string; 
      content: string; 
      nickname: string; 
      replyToId?: bigint | null;
      image?: ExternalBlob | null;
      video?: ExternalBlob | null;
      audio?: ExternalBlob | null;
    }) => {
      if (!actor) {
        throw new Error('Connection not ready. Please wait and try again.');
      }
      
      // Validate and trim inputs
      const trimmedRoomId = roomId.trim();
      const trimmedNickname = nickname.trim();
      
      if (!trimmedRoomId) {
        throw new Error('Room ID is required');
      }
      if (!trimmedNickname) {
        throw new Error('Nickname cannot be empty');
      }
      if (trimmedNickname.length > 20) {
        throw new Error('Nickname cannot exceed 20 characters');
      }
      if (!content && !image && !video && !audio) {
        throw new Error('Message content or media is required');
      }
      
      const userId = getUserId();
      
      try {
        // Retry sendMessage for transient failures
        const messageId = await retryWithBackoff(
          async () => {
            return await actor.sendMessage(
              trimmedRoomId, 
              content || (video ? '🎬 Video' : audio ? '🎵 Audio' : '📷 Image'), 
              trimmedNickname,
              userId,
              replyToId ?? null,
              image ?? null,
              video ?? null,
              audio ?? null
            );
          },
          {
            maxAttempts: 3,
            initialDelayMs: 200,
            maxDelayMs: 2000,
          }
        );
        
        // Backend returns the message ID on success, or traps on failure
        return { messageId, roomId: trimmedRoomId, content, nickname: trimmedNickname, replyToId, image, video, audio };
      } catch (err) {
        // Create structured error with both sanitized message and raw error
        const sanitized = sanitizeChatError(err);
        const operationError = createChatOperationError(
          'sendMessage',
          { 
            roomId: trimmedRoomId, 
            nickname: trimmedNickname, 
            hasContent: !!content,
            hasImage: !!image, 
            hasVideo: !!video, 
            hasAudio: !!audio 
          },
          sanitized,
          err
        );
        
        // Log structured error to console
        logChatOperationError(operationError);
        
        // Throw sanitized message for UI
        throw new Error(sanitized);
      }
    },
    // Optimistic update - add message to UI immediately
    onMutate: async ({ roomId, content, nickname, replyToId, image, video, audio }) => {
      const trimmedRoomId = roomId.trim();
      const userId = getUserId();
      
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['messages', trimmedRoomId] });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', trimmedRoomId]);

      // Optimistically update to the new value
      const optimisticId = `optimistic_${Date.now()}_${Math.random()}`;
      const optimisticMessage: OptimisticMessage = {
        id: BigInt(Date.now()), // Temporary ID
        content: content || (video ? '🎬 Video' : audio ? '🎵 Audio' : '📷 Image'),
        timestamp: BigInt(Date.now() * 1_000_000), // Convert to nanoseconds
        nickname: nickname.trim(),
        replyToId: replyToId ?? undefined,
        imageUrl: image ?? undefined,
        videoUrl: video ?? undefined,
        audioUrl: audio ?? undefined,
        isEdited: false,
        reactions: [],
        owner: userId,
        isOptimistic: true,
        optimisticId,
      };

      queryClient.setQueryData<MessageView[]>(
        ['messages', trimmedRoomId],
        (old = []) => [...old, optimisticMessage]
      );

      // Return context with previous messages and optimistic ID
      return { previousMessages, optimisticId };
    },
    // On error, roll back to the previous value
    onError: (err, variables, context) => {
      const trimmedRoomId = variables.roomId.trim();
      
      if (context?.previousMessages !== undefined) {
        // Restore previous messages if we have them
        queryClient.setQueryData(['messages', trimmedRoomId], context.previousMessages);
      } else {
        // If no previous messages, remove the optimistic message by filtering
        queryClient.setQueryData<MessageView[]>(
          ['messages', trimmedRoomId],
          (old = []) => old.filter((msg: any) => msg.optimisticId !== context?.optimisticId)
        );
      }
    },
    // Always refetch after error or success to ensure consistency
    onSettled: (data, error, variables) => {
      const trimmedRoomId = variables.roomId.trim();
      queryClient.invalidateQueries({ queryKey: ['messages', trimmedRoomId] });
    },
  });
}

// Edit a message
export function useEditMessage() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      roomId, 
      messageId, 
      newContent,
      newImage,
      newVideo,
      newAudio
    }: { 
      roomId: string; 
      messageId: bigint; 
      newContent: string;
      newImage?: ExternalBlob | null;
      newVideo?: ExternalBlob | null;
      newAudio?: ExternalBlob | null;
    }) => {
      if (!actor) {
        throw new Error('Connection not ready. Please wait and try again.');
      }
      
      const userId = getUserId();
      
      try {
        const success = await retryWithBackoff(
          async () => {
            return await actor.editMessage(
              roomId, 
              messageId, 
              userId, 
              newContent,
              newImage ?? null,
              newVideo ?? null,
              newAudio ?? null
            );
          },
          {
            maxAttempts: 2,
            initialDelayMs: 200,
            maxDelayMs: 1000,
          }
        );
        
        if (!success) {
          throw new Error('Failed to edit message');
        }
        
        return { roomId, messageId, newContent, newImage, newVideo, newAudio };
      } catch (err) {
        const sanitized = sanitizeChatError(err);
        const operationError = createChatOperationError(
          'editMessage',
          { roomId, messageId: messageId.toString() },
          sanitized,
          err
        );
        logChatOperationError(operationError);
        throw new Error(sanitized);
      }
    },
    onMutate: async ({ roomId, messageId, newContent, newImage, newVideo, newAudio }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', roomId] });
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', roomId]);

      queryClient.setQueryData<MessageView[]>(
        ['messages', roomId],
        (old = []) => old.map(msg => 
          msg.id === messageId 
            ? { 
                ...msg, 
                content: newContent, 
                isEdited: true,
                imageUrl: newImage ?? msg.imageUrl,
                videoUrl: newVideo ?? msg.videoUrl,
                audioUrl: newAudio ?? msg.audioUrl
              } 
            : msg
        )
      );

      return { previousMessages };
    },
    onError: (err, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', variables.roomId], context.previousMessages);
      }
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.roomId] });
    },
  });
}

// Delete a message
export function useDeleteMessage() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roomId, messageId }: { roomId: string; messageId: bigint }) => {
      if (!actor) {
        throw new Error('Connection not ready. Please wait and try again.');
      }
      
      const userId = getUserId();
      
      try {
        const success = await retryWithBackoff(
          async () => {
            return await actor.deleteMessage(roomId, messageId, userId);
          },
          {
            maxAttempts: 2,
            initialDelayMs: 200,
            maxDelayMs: 1000,
          }
        );
        
        if (!success) {
          throw new Error('Failed to delete message');
        }
        
        return { roomId, messageId };
      } catch (err) {
        const sanitized = sanitizeChatError(err);
        const operationError = createChatOperationError(
          'deleteMessage',
          { roomId, messageId: messageId.toString() },
          sanitized,
          err
        );
        logChatOperationError(operationError);
        throw new Error(sanitized);
      }
    },
    onMutate: async ({ roomId, messageId }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', roomId] });
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', roomId]);

      queryClient.setQueryData<MessageView[]>(
        ['messages', roomId],
        (old = []) => old.filter(msg => msg.id !== messageId)
      );

      return { previousMessages };
    },
    onError: (err, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', variables.roomId], context.previousMessages);
      }
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.roomId] });
    },
  });
}

// Add a reaction to a message
export function useAddReaction() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      roomId, 
      messageId, 
      emoji 
    }: { 
      roomId: string; 
      messageId: bigint; 
      emoji: string;
    }) => {
      if (!actor) {
        throw new Error('Connection not ready. Please wait and try again.');
      }
      
      const userId = getUserId();
      
      try {
        const success = await actor.addReaction(roomId, messageId, userId, emoji);
        
        if (!success) {
          throw new Error('Failed to add reaction');
        }
        
        return { roomId, messageId, userId, emoji };
      } catch (err) {
        const sanitized = sanitizeChatError(err);
        throw new Error(sanitized);
      }
    },
    onMutate: async ({ roomId, messageId, emoji }) => {
      const userId = getUserId();
      await queryClient.cancelQueries({ queryKey: ['messages', roomId] });
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', roomId]);

      queryClient.setQueryData<MessageView[]>(
        ['messages', roomId],
        (old = []) => old.map(msg => {
          if (msg.id === messageId) {
            const newReaction: Reaction = { userId, emoji };
            return { ...msg, reactions: [...msg.reactions, newReaction] };
          }
          return msg;
        })
      );

      return { previousMessages };
    },
    onError: (err, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', variables.roomId], context.previousMessages);
      }
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.roomId] });
    },
  });
}

// Remove a reaction from a message
export function useRemoveReaction() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      roomId, 
      messageId, 
      emoji 
    }: { 
      roomId: string; 
      messageId: bigint; 
      emoji: string;
    }) => {
      if (!actor) {
        throw new Error('Connection not ready. Please wait and try again.');
      }
      
      const userId = getUserId();
      
      try {
        const success = await actor.removeReaction(roomId, messageId, userId, emoji);
        
        if (!success) {
          throw new Error('Failed to remove reaction');
        }
        
        return { roomId, messageId, userId, emoji };
      } catch (err) {
        const sanitized = sanitizeChatError(err);
        throw new Error(sanitized);
      }
    },
    onMutate: async ({ roomId, messageId, emoji }) => {
      const userId = getUserId();
      await queryClient.cancelQueries({ queryKey: ['messages', roomId] });
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', roomId]);

      queryClient.setQueryData<MessageView[]>(
        ['messages', roomId],
        (old = []) => old.map(msg => {
          if (msg.id === messageId) {
            return { 
              ...msg, 
              reactions: msg.reactions.filter(r => !(r.userId === userId && r.emoji === emoji))
            };
          }
          return msg;
        })
      );

      return { previousMessages };
    },
    onError: (err, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', variables.roomId], context.previousMessages);
      }
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.roomId] });
    },
  });
}

// Fetch messages for a room with polling
export function useMessages(roomId: string | null) {
  const { actor, isFetching: isActorFetching } = useActor();

  return useQuery<MessageView[]>({
    queryKey: ['messages', roomId],
    queryFn: async () => {
      if (!actor || !roomId) return [];
      
      try {
        const messages = await actor.getMessages(roomId);
        return messages;
      } catch (error) {
        console.error('[useMessages] Query failed:', error);
        // Don't throw - return empty array to keep UI functional
        return [];
      }
    },
    enabled: !!actor && !isActorFetching && !!roomId,
    refetchInterval: 2000, // Poll every 2 seconds
    refetchIntervalInBackground: false,
    staleTime: 1000,
    retry: (failureCount, error) => {
      // Retry transient errors, but not permanent ones
      if (failureCount >= 3) return false;
      return true;
    },
  });
}

// Get message TTL
export function useMessageTTL() {
  const { actor, isFetching: isActorFetching } = useActor();

  return useQuery<bigint>({
    queryKey: ['messageTTL'],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not available');
      return actor.getMessageTTL();
    },
    enabled: !!actor && !isActorFetching,
    staleTime: Infinity, // TTL doesn't change
    retry: 1,
  });
}
