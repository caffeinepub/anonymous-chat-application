import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export class ExternalBlob {
    getBytes(): Promise<Uint8Array<ArrayBuffer>>;
    getDirectURL(): string;
    static fromURL(url: string): ExternalBlob;
    static fromBytes(blob: Uint8Array<ArrayBuffer>): ExternalBlob;
    withUploadProgress(onProgress: (percentage: number) => void): ExternalBlob;
}
export type Time = bigint;
export interface MessageView {
    id: bigint;
    content: string;
    nickname: string;
    audioUrl?: ExternalBlob;
    imageUrl?: ExternalBlob;
    isEdited: boolean;
    timestamp: Time;
    replyToId?: bigint;
    videoUrl?: ExternalBlob;
    reactions: Array<Reaction>;
}
export interface UserProfile {
    nickname: string;
}
export interface Reaction {
    userId: string;
    emoji: string;
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    addReaction(roomId: string, messageId: bigint, userId: string, emoji: string): Promise<boolean>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    createRoom(joinCode: string): Promise<string>;
    deleteMessage(roomId: string, messageId: bigint, userId: string): Promise<boolean>;
    editMessage(roomId: string, messageId: bigint, userId: string, newContent: string, newImage: ExternalBlob | null, newVideo: ExternalBlob | null, newAudio: ExternalBlob | null): Promise<boolean>;
    getCallerUserProfile(): Promise<UserProfile | null>;
    getCallerUserRole(): Promise<UserRole>;
    getMessageTTL(): Promise<Time>;
    getMessages(roomId: string): Promise<Array<MessageView>>;
    getUserProfile(user: string): Promise<UserProfile | null>;
    isCallerAdmin(): Promise<boolean>;
    removeReaction(roomId: string, messageId: bigint, userId: string, emoji: string): Promise<boolean>;
    saveCallerUserProfile(profile: UserProfile): Promise<void>;
    sendMessage(roomId: string, content: string, nickname: string, userId: string, replyToId: bigint | null, image: ExternalBlob | null, video: ExternalBlob | null, audio: ExternalBlob | null): Promise<bigint>;
}
