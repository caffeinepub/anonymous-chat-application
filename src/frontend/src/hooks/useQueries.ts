import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActor } from './useActor';
import type { MessageView, Reaction } from '../backend';
import { ExternalBlob } from '../backend';
import { sanitizeChatError } from '../utils/chatErrorMessages';
import { logChatOperationError, createChatOperationError } from '../utils/chatOperationErrors';
import { retryWithBackoff } from '../utils/retry';

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
      try {
        return await actor.createRoom(trimmedCode);
      } catch (err) {
        // Preserve the original error for proper sanitization
        throw err;
      }
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
        console.error('Room existence check failed:', error);
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
        throw new Error('Nickname is required');
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
      
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['messages', trimmedRoomId] });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', trimmedRoomId]);

      // Generate temporary optimistic ID
      const optimisticId = `optimistic_${Date.now()}_${Math.random()}`;
      
      // Create optimistic message - convert null to undefined for TypeScript
      const optimisticMessage: OptimisticMessage = {
        id: BigInt(Date.now()), // Temporary ID
        content: content || (video ? '🎬 Video' : audio ? '🎵 Audio' : '📷 Image'),
        nickname,
        timestamp: BigInt(Date.now() * 1_000_000), // Convert to nanoseconds
        replyToId: replyToId ?? undefined,
        imageUrl: image ?? undefined,
        videoUrl: video ?? undefined,
        audioUrl: audio ?? undefined,
        isEdited: false,
        reactions: [],
        isOptimistic: true,
        optimisticId,
      };

      // Optimistically update the cache
      queryClient.setQueryData<MessageView[]>(
        ['messages', trimmedRoomId],
        (old = []) => [...old, optimisticMessage as MessageView]
      );

      // Return context with previous messages for rollback
      return { previousMessages, optimisticId, trimmedRoomId };
    },
    // On error, rollback to previous state
    onError: (err, variables, context) => {
      if (context?.previousMessages && context?.trimmedRoomId) {
        queryClient.setQueryData(['messages', context.trimmedRoomId], context.previousMessages);
      }
      // Error is already logged in mutationFn with structured logging
    },
    // On success, replace optimistic message with real one
    onSuccess: (data, variables, context) => {
      // Invalidate to fetch the real message from backend
      const trimmedRoomId = context?.trimmedRoomId || variables.roomId.trim();
      queryClient.invalidateQueries({ queryKey: ['messages', trimmedRoomId] });
    },
  });
}

// Get messages for a room with optimized polling
export function useMessages(roomId: string | null, enabled: boolean = true) {
  const { actor, isFetching: isActorFetching } = useActor();

  return useQuery<MessageView[]>({
    queryKey: ['messages', roomId],
    queryFn: async () => {
      if (!actor || !roomId) return [];
      const trimmedRoomId = roomId.trim();
      try {
        const messages = await actor.getMessages(trimmedRoomId);
        return messages;
      } catch (error) {
        console.error('Failed to fetch messages:', error);
        
        // Check if it's a room-not-found error
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.toLowerCase().includes('room does not exist')) {
          // Throw to surface the error to the UI
          throw new Error(sanitizeChatError(error));
        }
        
        // For network/transient errors, also throw to surface them
        if (error instanceof Error && (
          errorMessage.includes('fetch') || 
          errorMessage.includes('network') ||
          errorMessage.includes('Failed to')
        )) {
          throw error;
        }
        
        // For other errors, return empty array as fallback
        return [];
      }
    },
    enabled: !!actor && !isActorFetching && !!roomId && enabled,
    // Optimized polling for real-time updates
    refetchInterval: (query) => {
      if (query.state.status === 'error') {
        return false;
      }
      // Faster polling for better real-time feel
      return 1500; // Poll every 1.5 seconds
    },
    refetchIntervalInBackground: true,
    staleTime: 0, // Always consider data stale for fresh fetches
    // Reduce retry attempts for faster error feedback
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes('Actor not initialized')) {
        return false;
      }
      // Don't retry room-not-found errors
      if (error instanceof Error && error.message.toLowerCase().includes('room does not exist')) {
        return false;
      }
      return failureCount < 2; // Only retry twice
    },
    retryDelay: (attemptIndex) => Math.min(500 * Math.pow(2, attemptIndex), 3000),
  });
}

// Delete a message with optimistic updates
export function useDeleteMessage() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roomId, messageId }: { roomId: string; messageId: bigint }) => {
      if (!actor) throw new Error('Connection not ready. Please wait and try again.');
      const trimmedRoomId = roomId.trim();
      const userId = getUserId();
      try {
        const result = await actor.deleteMessage(trimmedRoomId, messageId, userId);
        if (!result) {
          throw new Error('Failed to delete message');
        }
        return { result, roomId: trimmedRoomId, messageId };
      } catch (err) {
        const sanitized = sanitizeChatError(err);
        const operationError = createChatOperationError(
          'deleteMessage',
          { roomId: trimmedRoomId, messageId: messageId.toString() },
          sanitized,
          err
        );
        logChatOperationError(operationError);
        throw new Error(sanitized);
      }
    },
    // Optimistic update - remove message from UI immediately
    onMutate: async ({ roomId, messageId }) => {
      const trimmedRoomId = roomId.trim();
      await queryClient.cancelQueries({ queryKey: ['messages', trimmedRoomId] });
      
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', trimmedRoomId]);
      
      // Optimistically remove the message
      queryClient.setQueryData<MessageView[]>(
        ['messages', trimmedRoomId],
        (old = []) => old.filter(msg => msg.id !== messageId)
      );
      
      return { previousMessages, trimmedRoomId };
    },
    onError: (err, variables, context) => {
      if (context?.previousMessages && context?.trimmedRoomId) {
        queryClient.setQueryData(['messages', context.trimmedRoomId], context.previousMessages);
      }
      // Error is already logged in mutationFn
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['messages', data.roomId] });
    },
  });
}

// Edit a message with optimistic updates
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
      if (!actor) throw new Error('Connection not ready. Please wait and try again.');
      const trimmedRoomId = roomId.trim();
      const userId = getUserId();
      try {
        const result = await actor.editMessage(
          trimmedRoomId, 
          messageId,
          userId,
          newContent, 
          newImage ?? null,
          newVideo ?? null,
          newAudio ?? null
        );
        if (!result) {
          throw new Error('Failed to edit message');
        }
        return { result, roomId: trimmedRoomId, messageId, newContent, newImage, newVideo, newAudio };
      } catch (err) {
        const sanitized = sanitizeChatError(err);
        const operationError = createChatOperationError(
          'editMessage',
          { roomId: trimmedRoomId, messageId: messageId.toString() },
          sanitized,
          err
        );
        logChatOperationError(operationError);
        throw new Error(sanitized);
      }
    },
    // Optimistic update - update message in UI immediately
    onMutate: async ({ roomId, messageId, newContent, newImage, newVideo, newAudio }) => {
      const trimmedRoomId = roomId.trim();
      await queryClient.cancelQueries({ queryKey: ['messages', trimmedRoomId] });
      
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', trimmedRoomId]);
      
      // Optimistically update the message
      queryClient.setQueryData<MessageView[]>(
        ['messages', trimmedRoomId],
        (old = []) => old.map(msg => 
          msg.id === messageId 
            ? { 
                ...msg, 
                content: newContent, 
                isEdited: true,
                imageUrl: newImage ?? msg.imageUrl,
                videoUrl: newVideo ?? msg.videoUrl,
                audioUrl: newAudio ?? msg.audioUrl,
              } 
            : msg
        )
      );
      
      return { previousMessages, trimmedRoomId };
    },
    onError: (err, variables, context) => {
      if (context?.previousMessages && context?.trimmedRoomId) {
        queryClient.setQueryData(['messages', context.trimmedRoomId], context.previousMessages);
      }
      // Error is already logged in mutationFn
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['messages', data.roomId] });
    },
  });
}

// Add a reaction with optimistic updates
export function useAddReaction() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      roomId, 
      messageId, 
      userId, 
      emoji 
    }: { 
      roomId: string; 
      messageId: bigint; 
      userId: string; 
      emoji: string;
    }) => {
      if (!actor) throw new Error('Connection not ready. Please wait and try again.');
      const trimmedRoomId = roomId.trim();
      try {
        const result = await actor.addReaction(trimmedRoomId, messageId, userId, emoji);
        if (!result) {
          throw new Error('Failed to add reaction');
        }
        return { result, roomId: trimmedRoomId, messageId, userId, emoji };
      } catch (err) {
        const sanitized = sanitizeChatError(err);
        const operationError = createChatOperationError(
          'addReaction',
          { roomId: trimmedRoomId, messageId: messageId.toString(), emoji },
          sanitized,
          err
        );
        logChatOperationError(operationError);
        throw new Error(sanitized);
      }
    },
    // Optimistic update - add reaction immediately
    onMutate: async ({ roomId, messageId, userId, emoji }) => {
      const trimmedRoomId = roomId.trim();
      await queryClient.cancelQueries({ queryKey: ['messages', trimmedRoomId] });
      
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', trimmedRoomId]);
      
      // Optimistically add the reaction
      queryClient.setQueryData<MessageView[]>(
        ['messages', trimmedRoomId],
        (old = []) => old.map(msg => 
          msg.id === messageId 
            ? { 
                ...msg, 
                reactions: [...msg.reactions, { userId, emoji }]
              } 
            : msg
        )
      );
      
      return { previousMessages, trimmedRoomId };
    },
    onError: (err, variables, context) => {
      if (context?.previousMessages && context?.trimmedRoomId) {
        queryClient.setQueryData(['messages', context.trimmedRoomId], context.previousMessages);
      }
      // Error is already logged in mutationFn
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['messages', data.roomId] });
    },
  });
}

// Remove a reaction with optimistic updates
export function useRemoveReaction() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      roomId, 
      messageId, 
      userId, 
      emoji 
    }: { 
      roomId: string; 
      messageId: bigint; 
      userId: string; 
      emoji: string;
    }) => {
      if (!actor) throw new Error('Connection not ready. Please wait and try again.');
      const trimmedRoomId = roomId.trim();
      try {
        const result = await actor.removeReaction(trimmedRoomId, messageId, userId, emoji);
        if (!result) {
          throw new Error('Failed to remove reaction');
        }
        return { result, roomId: trimmedRoomId, messageId, userId, emoji };
      } catch (err) {
        const sanitized = sanitizeChatError(err);
        const operationError = createChatOperationError(
          'removeReaction',
          { roomId: trimmedRoomId, messageId: messageId.toString(), emoji },
          sanitized,
          err
        );
        logChatOperationError(operationError);
        throw new Error(sanitized);
      }
    },
    // Optimistic update - remove reaction immediately
    onMutate: async ({ roomId, messageId, userId, emoji }) => {
      const trimmedRoomId = roomId.trim();
      await queryClient.cancelQueries({ queryKey: ['messages', trimmedRoomId] });
      
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', trimmedRoomId]);
      
      // Optimistically remove the reaction
      queryClient.setQueryData<MessageView[]>(
        ['messages', trimmedRoomId],
        (old = []) => old.map(msg => 
          msg.id === messageId 
            ? { 
                ...msg, 
                reactions: msg.reactions.filter(
                  r => !(r.userId === userId && r.emoji === emoji)
                )
              } 
            : msg
        )
      );
      
      return { previousMessages, trimmedRoomId };
    },
    onError: (err, variables, context) => {
      if (context?.previousMessages && context?.trimmedRoomId) {
        queryClient.setQueryData(['messages', context.trimmedRoomId], context.previousMessages);
      }
      // Error is already logged in mutationFn
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['messages', data.roomId] });
    },
  });
}

// Get message TTL from backend
export function useMessageTTL() {
  const { actor, isFetching: isActorFetching } = useActor();

  return useQuery<bigint>({
    queryKey: ['messageTTL'],
    queryFn: async () => {
      if (!actor) {
        // Return default 24 hours as fallback while actor loads
        return 86_400_000_000_000n;
      }
      return await actor.getMessageTTL();
    },
    enabled: !!actor && !isActorFetching,
    staleTime: Infinity, // TTL doesn't change
  });
}
