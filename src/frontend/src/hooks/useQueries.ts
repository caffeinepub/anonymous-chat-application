import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActor } from './useActor';
import type { MessageView, Reaction } from '../backend';
import { ExternalBlob } from '../backend';

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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (joinCode: string) => {
      if (!actor) throw new Error('Actor not initialized. Please wait for the connection to establish.');
      return await actor.createRoom(joinCode);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (error) => {
      console.error('Failed to create room:', error);
      throw error;
    },
  });
}

// Check if room exists by attempting to get messages
export function useRoomExists(roomId: string | null) {
  const { actor, isFetching: isActorFetching } = useActor();

  return useQuery<boolean>({
    queryKey: ['roomExists', roomId],
    queryFn: async () => {
      if (!actor || !roomId) return false;
      try {
        await actor.getMessages(roomId);
        return true;
      } catch (error) {
        console.error('Room check failed:', error);
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

// Send a message with optimistic updates
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
      if (!actor) throw new Error('Actor not initialized. Please wait for the connection to establish.');
      
      // Validate inputs
      if (!roomId || !roomId.trim()) {
        throw new Error('Room ID is required');
      }
      if (!nickname || !nickname.trim()) {
        throw new Error('Nickname is required');
      }
      if (!content && !image && !video && !audio) {
        throw new Error('Message content or media is required');
      }
      
      const userId = getUserId();
      
      const messageId = await actor.sendMessage(
        roomId, 
        content || (video ? '🎬 Video' : audio ? '🎵 Audio' : '📷 Image'), 
        nickname,
        userId,
        replyToId ?? null,
        image ?? null,
        video ?? null,
        audio ?? null
      );
      return { messageId, roomId, content, nickname, replyToId, image, video, audio };
    },
    // Optimistic update - add message to UI immediately
    onMutate: async ({ roomId, content, nickname, replyToId, image, video, audio }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['messages', roomId] });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', roomId]);

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
        ['messages', roomId],
        (old = []) => [...old, optimisticMessage as MessageView]
      );

      // Return context with previous messages for rollback
      return { previousMessages, optimisticId };
    },
    // On error, rollback to previous state
    onError: (err, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', variables.roomId], context.previousMessages);
      }
      console.error('Failed to send message:', err);
    },
    // On success, replace optimistic message with real one
    onSuccess: (data, variables) => {
      // Invalidate to fetch the real message from backend
      queryClient.invalidateQueries({ queryKey: ['messages', variables.roomId] });
    },
    // Always refetch after error or success to ensure consistency
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.roomId] });
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
      try {
        const messages = await actor.getMessages(roomId);
        return messages;
      } catch (error) {
        console.error('Failed to fetch messages:', error);
        if (error instanceof Error && (
          error.message.includes('fetch') || 
          error.message.includes('network') ||
          error.message.includes('Failed to')
        )) {
          throw error;
        }
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
      if (!actor) throw new Error('Actor not initialized. Please wait for the connection to establish.');
      const userId = getUserId();
      const result = await actor.deleteMessage(roomId, messageId, userId);
      if (!result) {
        throw new Error('Failed to delete message');
      }
      return { result, roomId, messageId };
    },
    // Optimistic update - remove message from UI immediately
    onMutate: async ({ roomId, messageId }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', roomId] });
      
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', roomId]);
      
      // Optimistically remove the message
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
      console.error('Failed to delete message:', err);
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
      if (!actor) throw new Error('Actor not initialized. Please wait for the connection to establish.');
      const userId = getUserId();
      const result = await actor.editMessage(
        roomId, 
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
      return { result, roomId, messageId, newContent, newImage, newVideo, newAudio };
    },
    // Optimistic update - update message in UI immediately
    onMutate: async ({ roomId, messageId, newContent, newImage, newVideo, newAudio }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', roomId] });
      
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', roomId]);
      
      // Optimistically update the message
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
                audioUrl: newAudio ?? msg.audioUrl,
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
      console.error('Failed to edit message:', err);
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
      if (!actor) throw new Error('Actor not initialized. Please wait for the connection to establish.');
      const result = await actor.addReaction(roomId, messageId, userId, emoji);
      if (!result) {
        throw new Error('Failed to add reaction');
      }
      return { result, roomId, messageId, userId, emoji };
    },
    // Optimistic update - add reaction immediately
    onMutate: async ({ roomId, messageId, userId, emoji }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', roomId] });
      
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', roomId]);
      
      // Optimistically add the reaction
      queryClient.setQueryData<MessageView[]>(
        ['messages', roomId],
        (old = []) => old.map(msg => 
          msg.id === messageId 
            ? { 
                ...msg, 
                reactions: [...msg.reactions, { userId, emoji }]
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
      console.error('Failed to add reaction:', err);
    },
    onSuccess: (data) => {
      // Invalidate with a slight delay to avoid race conditions
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['messages', data.roomId] });
      }, 100);
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
      if (!actor) throw new Error('Actor not initialized. Please wait for the connection to establish.');
      const result = await actor.removeReaction(roomId, messageId, userId, emoji);
      if (!result) {
        throw new Error('Failed to remove reaction');
      }
      return { result, roomId, messageId, userId, emoji };
    },
    // Optimistic update - remove reaction immediately
    onMutate: async ({ roomId, messageId, userId, emoji }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', roomId] });
      
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', roomId]);
      
      // Optimistically remove the reaction
      queryClient.setQueryData<MessageView[]>(
        ['messages', roomId],
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
      
      return { previousMessages };
    },
    onError: (err, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', variables.roomId], context.previousMessages);
      }
      console.error('Failed to remove reaction:', err);
    },
    onSuccess: (data) => {
      // Invalidate with a slight delay to avoid race conditions
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['messages', data.roomId] });
      }, 100);
    },
  });
}

// Get message TTL - hardcoded to 24 hours as per backend configuration
export function useMessageTTL() {
  return useQuery<bigint>({
    queryKey: ['messageTTL'],
    queryFn: async () => {
      // Return 24 hours in nanoseconds (backend messageTTL value)
      return 86_400_000_000_000n;
    },
    staleTime: Infinity, // TTL doesn't change
  });
}
