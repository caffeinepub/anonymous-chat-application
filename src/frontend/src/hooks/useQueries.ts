import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActor } from './useActor';
import type { MessageView, Reaction } from '../backend';
import { ExternalBlob } from '../backend';
import { sanitizeChatError } from '../utils/chatErrorMessages';
import { logChatOperationError, createChatOperationError } from '../utils/chatOperationErrors';
import { retryWithBackoff } from '../utils/retry';
import { toastErrorOnce } from '../utils/toastOnce';
import { usePageVisibility } from './usePageVisibility';
import { normalizeRoomId } from '../utils/roomId';
import { extractICRejectDetails } from '../utils/icRejectDetails';

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
      const normalizedCode = normalizeRoomId(joinCode);
      if (!normalizedCode) {
        throw new Error('Room code cannot be empty');
      }
      if (normalizedCode.length > 30) {
        throw new Error('Room code cannot exceed 30 characters');
      }
      
      const result = await actor.createRoom(normalizedCode);
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
    queryKey: ['roomExists', roomId ? normalizeRoomId(roomId) : null],
    queryFn: async () => {
      if (!actor || !roomId) return false;
      const normalizedRoomId = normalizeRoomId(roomId);
      try {
        const exists = await actor.roomExists(normalizedRoomId);
        return exists;
      } catch (error) {
        const sanitizedError = sanitizeChatError(error);
        const operationError = createChatOperationError(
          'roomExists (query)',
          { 
            roomId: normalizedRoomId,
            actorAvailable: !!actor
          },
          sanitizedError,
          error
        );
        logChatOperationError(operationError);
        return false;
      }
    },
    enabled: !!actor && !isActorFetching && !!roomId,
    staleTime: 30000,
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
      audio,
      nonce
    }: { 
      roomId: string; 
      content: string; 
      nickname: string; 
      replyToId?: bigint | null;
      image?: ExternalBlob | null;
      video?: ExternalBlob | null;
      audio?: ExternalBlob | null;
      nonce: string;
    }) => {
      if (!actor) {
        throw new Error('Connection not ready. Please wait and try again.');
      }
      
      const normalizedRoomId = normalizeRoomId(roomId);
      const trimmedNickname = nickname.trim();
      
      if (!normalizedRoomId) {
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
        // Retry sendMessage for transient failures with the same nonce
        const messageId = await retryWithBackoff(
          async () => {
            return await actor.sendMessage(
              normalizedRoomId, 
              content || (video ? '🎬 Video' : audio ? '🎵 Audio' : '📷 Image'), 
              trimmedNickname,
              userId,
              replyToId ?? null,
              image ?? null,
              video ?? null,
              audio ?? null,
              nonce
            );
          },
          {
            maxAttempts: 3,
            initialDelayMs: 200,
            maxDelayMs: 2000,
          }
        );
        
        return { messageId, roomId: normalizedRoomId, content, nickname: trimmedNickname, replyToId, image, video, audio, nonce };
      } catch (err) {
        const sanitized = sanitizeChatError(err);
        const icRejectDetails = extractICRejectDetails(err);
        
        // Log structured error with nonce and IC details
        console.group('❌ Send Message Failed');
        console.log('Room ID:', normalizedRoomId);
        console.log('Nonce:', nonce);
        console.log('Has Content:', !!content);
        console.log('Has Media:', { image: !!image, video: !!video, audio: !!audio });
        if (icRejectDetails) {
          console.log('IC Reject Details:', icRejectDetails);
        }
        console.log('Error:', err);
        console.groupEnd();
        
        throw new Error(sanitized);
      }
    },
    // Optimistic update - add message to UI immediately
    onMutate: async ({ roomId, content, nickname, replyToId, image, video, audio, nonce }) => {
      const normalizedRoomId = normalizeRoomId(roomId);
      const userId = getUserId();
      
      await queryClient.cancelQueries({ queryKey: ['messages', normalizedRoomId] });

      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', normalizedRoomId]);

      const optimisticId = `optimistic_${nonce}`;
      const optimisticMessage: OptimisticMessage = {
        id: BigInt(Date.now()),
        content: content || (video ? '🎬 Video' : audio ? '🎵 Audio' : '📷 Image'),
        timestamp: BigInt(Date.now() * 1_000_000),
        nickname: nickname.trim(),
        replyToId: replyToId ?? undefined,
        imageUrl: image ?? undefined,
        videoUrl: video ?? undefined,
        audioUrl: audio ?? undefined,
        isEdited: false,
        reactions: [],
        owner: userId,
        nonce,
        isOptimistic: true,
        optimisticId,
      };

      queryClient.setQueryData<MessageView[]>(
        ['messages', normalizedRoomId],
        (old = []) => [...old, optimisticMessage]
      );

      return { previousMessages, optimisticId, nonce };
    },
    // On success, reconcile optimistic message with real backend messageId
    onSuccess: (data, variables, context) => {
      const normalizedRoomId = normalizeRoomId(variables.roomId);
      const { messageId, nonce } = data;
      
      // Update the optimistic message with the real backend ID
      // Also remove any duplicates with the same nonce
      queryClient.setQueryData<MessageView[]>(
        ['messages', normalizedRoomId],
        (old = []) => {
          const withoutOptimistic = old.filter((msg: any) => 
            msg.optimisticId !== context?.optimisticId
          );
          
          // Check if message with this ID already exists (from polling)
          const alreadyExists = withoutOptimistic.some(msg => msg.id === messageId);
          
          if (alreadyExists) {
            // Message already in list from polling, just remove optimistic
            return withoutOptimistic;
          }
          
          // Find the optimistic message and convert it to real
          const optimisticMsg = old.find((msg: any) => msg.optimisticId === context?.optimisticId);
          if (optimisticMsg) {
            const { isOptimistic, optimisticId, ...realMsg } = optimisticMsg as any;
            return [...withoutOptimistic, { ...realMsg, id: messageId }];
          }
          
          return withoutOptimistic;
        }
      );
    },
    // On error, roll back to the previous value
    onError: (err, variables, context) => {
      const normalizedRoomId = normalizeRoomId(variables.roomId);
      
      if (context?.previousMessages !== undefined) {
        queryClient.setQueryData(['messages', normalizedRoomId], context.previousMessages);
      } else {
        queryClient.setQueryData<MessageView[]>(
          ['messages', normalizedRoomId],
          (old = []) => old.filter((msg: any) => msg.optimisticId !== context?.optimisticId)
        );
      }
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
      
      const normalizedRoomId = normalizeRoomId(roomId);
      const userId = getUserId();
      
      try {
        const success = await retryWithBackoff(
          async () => {
            return await actor.editMessage(
              normalizedRoomId, 
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
          throw new Error('You can only edit your own messages.');
        }
        
        return { roomId: normalizedRoomId, messageId, newContent, newImage, newVideo, newAudio };
      } catch (err) {
        const sanitized = sanitizeChatError(err);
        const operationError = createChatOperationError(
          'editMessage',
          { roomId: normalizedRoomId, messageId: messageId.toString() },
          sanitized,
          err
        );
        logChatOperationError(operationError);
        throw new Error(sanitized);
      }
    },
    onMutate: async ({ roomId, messageId, newContent, newImage, newVideo, newAudio }) => {
      const normalizedRoomId = normalizeRoomId(roomId);
      await queryClient.cancelQueries({ queryKey: ['messages', normalizedRoomId] });
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', normalizedRoomId]);

      queryClient.setQueryData<MessageView[]>(
        ['messages', normalizedRoomId],
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
      const normalizedRoomId = normalizeRoomId(variables.roomId);
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', normalizedRoomId], context.previousMessages);
      }
    },
    onSettled: (data, error, variables) => {
      const normalizedRoomId = normalizeRoomId(variables.roomId);
      queryClient.invalidateQueries({ queryKey: ['messages', normalizedRoomId] });
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
      
      const normalizedRoomId = normalizeRoomId(roomId);
      const userId = getUserId();
      
      try {
        const success = await retryWithBackoff(
          async () => {
            return await actor.deleteMessage(normalizedRoomId, messageId, userId);
          },
          {
            maxAttempts: 2,
            initialDelayMs: 200,
            maxDelayMs: 1000,
          }
        );
        
        if (!success) {
          throw new Error('You can only delete your own messages.');
        }
        
        return { roomId: normalizedRoomId, messageId };
      } catch (err) {
        const sanitized = sanitizeChatError(err);
        const icRejectDetails = extractICRejectDetails(err);
        
        // Log structured error with IC details
        console.group('❌ Delete Message Failed');
        console.log('Room ID:', normalizedRoomId);
        console.log('Message ID:', messageId.toString());
        if (icRejectDetails) {
          console.log('IC Reject Details:', icRejectDetails);
        }
        console.log('Error:', err);
        console.groupEnd();
        
        throw new Error(sanitized);
      }
    },
    onMutate: async ({ roomId, messageId }) => {
      const normalizedRoomId = normalizeRoomId(roomId);
      await queryClient.cancelQueries({ queryKey: ['messages', normalizedRoomId] });
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', normalizedRoomId]);

      queryClient.setQueryData<MessageView[]>(
        ['messages', normalizedRoomId],
        (old = []) => old.filter(msg => msg.id !== messageId)
      );

      return { previousMessages };
    },
    onError: (err, variables, context) => {
      const normalizedRoomId = normalizeRoomId(variables.roomId);
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', normalizedRoomId], context.previousMessages);
      }
    },
    onSettled: (data, error, variables) => {
      const normalizedRoomId = normalizeRoomId(variables.roomId);
      queryClient.invalidateQueries({ queryKey: ['messages', normalizedRoomId] });
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
      
      const normalizedRoomId = normalizeRoomId(roomId);
      const userId = getUserId();
      
      try {
        const success = await actor.addReaction(normalizedRoomId, messageId, userId, emoji);
        
        if (!success) {
          throw new Error('Failed to add reaction');
        }
        
        return { roomId: normalizedRoomId, messageId, userId, emoji };
      } catch (err) {
        const sanitized = sanitizeChatError(err);
        throw new Error(sanitized);
      }
    },
    onMutate: async ({ roomId, messageId, emoji }) => {
      const normalizedRoomId = normalizeRoomId(roomId);
      const userId = getUserId();
      await queryClient.cancelQueries({ queryKey: ['messages', normalizedRoomId] });
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', normalizedRoomId]);

      queryClient.setQueryData<MessageView[]>(
        ['messages', normalizedRoomId],
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
      const normalizedRoomId = normalizeRoomId(variables.roomId);
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', normalizedRoomId], context.previousMessages);
      }
    },
    onSettled: (data, error, variables) => {
      const normalizedRoomId = normalizeRoomId(variables.roomId);
      queryClient.invalidateQueries({ queryKey: ['messages', normalizedRoomId] });
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
      
      const normalizedRoomId = normalizeRoomId(roomId);
      const userId = getUserId();
      
      try {
        const success = await actor.removeReaction(normalizedRoomId, messageId, userId, emoji);
        
        if (!success) {
          throw new Error('Failed to remove reaction');
        }
        
        return { roomId: normalizedRoomId, messageId, userId, emoji };
      } catch (err) {
        const sanitized = sanitizeChatError(err);
        throw new Error(sanitized);
      }
    },
    onMutate: async ({ roomId, messageId, emoji }) => {
      const normalizedRoomId = normalizeRoomId(roomId);
      const userId = getUserId();
      await queryClient.cancelQueries({ queryKey: ['messages', normalizedRoomId] });
      const previousMessages = queryClient.getQueryData<MessageView[]>(['messages', normalizedRoomId]);

      queryClient.setQueryData<MessageView[]>(
        ['messages', normalizedRoomId],
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
      const normalizedRoomId = normalizeRoomId(variables.roomId);
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', normalizedRoomId], context.previousMessages);
      }
    },
    onSettled: (data, error, variables) => {
      const normalizedRoomId = normalizeRoomId(variables.roomId);
      queryClient.invalidateQueries({ queryKey: ['messages', normalizedRoomId] });
    },
  });
}

// Fetch messages for a room with incremental polling
export function useMessages(roomId: string | null) {
  const { actor, isFetching: isActorFetching } = useActor();
  const queryClient = useQueryClient();
  const isPageVisible = usePageVisibility();

  const normalizedRoomId = roomId ? normalizeRoomId(roomId) : null;

  return useQuery<MessageView[]>({
    queryKey: ['messages', normalizedRoomId],
    queryFn: async () => {
      if (!actor || !normalizedRoomId) return [];
      
      try {
        const cachedMessages = queryClient.getQueryData<MessageView[]>(['messages', normalizedRoomId]) || [];
        
        const realMessages = cachedMessages.filter((msg: any) => !msg.isOptimistic);
        
        if (realMessages.length === 0) {
          const allMessages = await actor.getMessages(normalizedRoomId);
          return allMessages;
        }
        
        const lastRealMessage = realMessages[realMessages.length - 1];
        const lastId = lastRealMessage.id;
        
        const newMessages = await actor.fetchMessagesAfterId(normalizedRoomId, lastId);
        
        if (newMessages.length > 0) {
          const mergedMessages = [...realMessages, ...newMessages];
          
          const uniqueMessages = mergedMessages.filter((msg, index, self) =>
            index === self.findIndex((m) => m.id === msg.id)
          );
          
          return uniqueMessages.sort((a, b) => Number(a.timestamp - b.timestamp));
        }
        
        return realMessages;
      } catch (error) {
        const sanitized = sanitizeChatError(error);
        console.error('[useMessages] Query failed:', sanitized);
        throw new Error(sanitized);
      }
    },
    enabled: !!actor && !isActorFetching && !!normalizedRoomId,
    refetchInterval: isPageVisible ? 2000 : false,
    staleTime: 1000,
    retry: 2,
  });
}
