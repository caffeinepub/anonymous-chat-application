import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { MediaFile, MessageView } from "../backend";
import { getChatErrorMessage } from "../utils/chatErrorMessages";
import { logOperationError } from "../utils/chatOperationErrors";
import { useActor } from "./useActor";

export function useCreateRoom() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      joinCode,
      nickname,
    }: { joinCode: string; nickname: string }) => {
      if (!actor) {
        const error = new Error("Actor not initialized");
        console.error("[useCreateRoom] Actor not available");
        throw error;
      }

      console.log(
        "[useCreateRoom] Calling backend createRoom with code:",
        joinCode,
        "nickname:",
        nickname,
      );
      try {
        const result = await actor.createRoom(joinCode, nickname);
        console.log("[useCreateRoom] Backend returned:", result);
        return result.joinCode;
      } catch (error: any) {
        console.error("[useCreateRoom] Backend call failed:", {
          error,
          message: error?.message,
          stack: error?.stack,
          type: typeof error,
          stringified: JSON.stringify(error, null, 2),
        });
        throw error;
      }
    },
    onSuccess: (roomId) => {
      console.log("[useCreateRoom] Room created successfully:", roomId);
      queryClient.invalidateQueries({ queryKey: ["roomExists", roomId] });
    },
    onError: (error: any) => {
      console.error("[useCreateRoom] Mutation error:", error);
      logOperationError("createRoom", error);
    },
  });
}

export function useJoinRoom() {
  const { actor } = useActor();

  return useMutation({
    mutationFn: async ({
      joinCode,
      nickname,
    }: { joinCode: string; nickname: string }) => {
      if (!actor) {
        throw new Error("Actor not initialized");
      }

      console.log(
        "[useJoinRoom] Calling backend joinRoom with code:",
        joinCode,
        "nickname:",
        nickname,
      );
      const result = await actor.joinRoom(joinCode, nickname);
      console.log("[useJoinRoom] Backend returned:", result);
      return result.nickname;
    },
    onError: (error: any) => {
      console.error("[useJoinRoom] Mutation error:", error);
      logOperationError("joinRoom", error);
    },
  });
}

export function useCheckRoomExists(roomId: string) {
  const { actor, isFetching: actorFetching } = useActor();

  return useQuery<boolean>({
    queryKey: ["roomExists", roomId],
    queryFn: async () => {
      if (!actor) {
        console.error("[useCheckRoomExists] Actor not available");
        throw new Error("Actor not initialized");
      }

      console.log("[useCheckRoomExists] Checking room existence for:", roomId);
      try {
        const exists = await actor.roomExists(roomId);
        console.log("[useCheckRoomExists] Backend returned:", exists);
        return exists;
      } catch (error: any) {
        console.error("[useCheckRoomExists] Backend call failed:", {
          error,
          message: error?.message,
          stack: error?.stack,
          type: typeof error,
          stringified: JSON.stringify(error, null, 2),
        });
        throw error;
      }
    },
    enabled: !!actor && !actorFetching && roomId.length > 0,
    retry: 1,
    staleTime: 0,
  });
}

export function useGetMessages(roomId: string) {
  const { actor, isFetching: actorFetching } = useActor();

  return useQuery<MessageView[]>({
    queryKey: ["messages", roomId],
    queryFn: async () => {
      if (!actor) throw new Error("Actor not initialized");
      return actor.getMessages(roomId);
    },
    enabled: !!actor && !actorFetching && roomId.length > 0,
    refetchInterval: 3000,
    staleTime: 0,
  });
}

export function useSendMessage(roomId: string) {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      content,
      nickname,
      userId: _userId,
      replyToId,
      image,
      video,
      audio,
      nonce,
    }: {
      content: string;
      nickname: string;
      userId: string;
      replyToId?: bigint;
      image?: MediaFile;
      video?: MediaFile;
      audio?: MediaFile;
      nonce: string;
    }) => {
      if (!actor) throw new Error("Actor not initialized");

      return actor.sendMessage(
        roomId,
        content,
        nickname,
        replyToId ?? null,
        image ?? null,
        video ?? null,
        audio ?? null,
        nonce,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", roomId] });
    },
    onError: (error: any) => {
      logOperationError("sendMessage", error);
      const errorMessage = getChatErrorMessage(error);
      toast.error(errorMessage);
    },
  });
}

export function useEditMessage(roomId: string) {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      messageId,
      userId: _userId,
      nickname,
      newContent,
      newImage,
      newVideo,
      newAudio,
    }: {
      messageId: bigint;
      userId: string;
      nickname: string;
      newContent: string;
      newImage?: MediaFile;
      newVideo?: MediaFile;
      newAudio?: MediaFile;
    }) => {
      if (!actor) throw new Error("Actor not initialized");

      return actor.editMessage(
        roomId,
        messageId,
        nickname,
        newContent,
        newImage ?? null,
        newVideo ?? null,
        newAudio ?? null,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", roomId] });
    },
    onError: (error: any) => {
      logOperationError("editMessage", error);
    },
  });
}

export function useDeleteMessage(roomId: string) {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      messageId,
      userId: _userId,
    }: { messageId: bigint; userId: string }) => {
      if (!actor) throw new Error("Actor not initialized");
      return actor.deleteMessage(roomId, messageId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", roomId] });
    },
    onError: (error: any) => {
      logOperationError("deleteMessage", error);
    },
  });
}

export function useAddReaction(roomId: string) {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      messageId,
      userId,
      emoji,
    }: {
      messageId: bigint;
      userId: string;
      emoji: string;
    }) => {
      if (!actor) throw new Error("Actor not initialized");
      return actor.addReaction(roomId, messageId, userId, emoji);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", roomId] });
    },
    onError: (error: any) => {
      logOperationError("addReaction", error);
    },
  });
}

export function useRemoveReaction(roomId: string) {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      messageId,
      userId,
      emoji,
    }: {
      messageId: bigint;
      userId: string;
      emoji: string;
    }) => {
      if (!actor) throw new Error("Actor not initialized");
      return actor.removeReaction(roomId, messageId, userId, emoji);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", roomId] });
    },
    onError: (error: any) => {
      logOperationError("removeReaction", error);
    },
  });
}
