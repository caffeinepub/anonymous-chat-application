import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Send,
  Image as ImageIcon,
  Smile,
  Loader2,
  Mic,
  Video,
  X,
  AlertCircle,
  Upload,
} from 'lucide-react';
import {
  useGetMessages,
  useSendMessage,
  useEditMessage,
  useDeleteMessage,
  useAddReaction,
  useRemoveReaction,
} from '../hooks/useQueries';
import MessageBubble from './MessageBubble';
import EmojiPicker from './EmojiPicker';
import AudioRecorder from './AudioRecorder';
import VideoRecorder from './VideoRecorder';
import VideoUploader from './VideoUploader';
import type { MessageView, MediaFile } from '../backend';
import { ExternalBlob } from '../backend';
import { toast } from 'sonner';
import { useVisualViewportOffset } from '../hooks/useVisualViewportOffset';
import { normalizeRoomId } from '../utils/roomId';
import { generateMessageNonce } from '../utils/messageNonce';
import { isImageMimeType, generateFallbackFilename } from '../utils/mime';

interface ChatRoomProps {
  roomId: string;
  nickname: string;
}

// Generate a unique user ID for the session (stored in localStorage)
function getUserId(): string {
  const stored = localStorage.getItem('chatUserId');
  if (stored) return stored;
  const newId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  localStorage.setItem('chatUserId', newId);
  return newId;
}

export default function ChatRoom({ roomId, nickname }: ChatRoomProps) {
  // Normalize roomId for all operations
  const normalizedRoomId = normalizeRoomId(roomId);

  const [messageInput, setMessageInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const [showVideoUploader, setShowVideoUploader] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageView | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessageView | null>(null);
  const [selectedImage, setSelectedImage] = useState<MediaFile | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [currentNonce, setCurrentNonce] = useState<string | null>(null);
  const [composerHeight, setComposerHeight] = useState(180);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewportState = useVisualViewportOffset();
  const keyboardOffset = viewportState.keyboardOffset;

  const currentUserId = getUserId();

  const { data: messages = [], isLoading, error: messagesError } = useGetMessages(normalizedRoomId);
  const sendMessageMutation = useSendMessage(normalizedRoomId);
  const editMessageMutation = useEditMessage(normalizedRoomId);
  const deleteMessageMutation = useDeleteMessage(normalizedRoomId);
  const addReactionMutation = useAddReaction(normalizedRoomId);
  const removeReactionMutation = useRemoveReaction(normalizedRoomId);

  // Measure composer height dynamically
  useEffect(() => {
    if (!composerRef.current) return;

    const updateHeight = () => {
      if (composerRef.current) {
        const height = composerRef.current.offsetHeight;
        setComposerHeight(height);
      }
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(composerRef.current);

    return () => resizeObserver.disconnect();
  }, [replyingTo, editingMessage, selectedImage]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate that it's an image
    if (!isImageMimeType(file.type)) {
      toast.error('Please select a valid image file (JPEG, PNG, GIF, WebP, etc.)');
      e.target.value = ''; // Reset input
      return;
    }

    try {
      // Convert File to ExternalBlob
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const externalBlob = ExternalBlob.fromBytes(uint8Array);

      // Create MediaFile with metadata
      const mediaFile: MediaFile = {
        file: externalBlob,
        originalName: file.name,
        contentType: file.type,
      };

      setSelectedImage(mediaFile);
      e.target.value = ''; // Reset input for next selection
      inputRef.current?.focus();
    } catch (error) {
      console.error('Error loading image:', error);
      toast.error('Failed to load image. Please try again.');
      e.target.value = '';
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();

    // Prevent double submission
    if (isSending) {
      return;
    }

    const trimmedMessage = messageInput.trim();

    if (!trimmedMessage && !selectedImage) {
      return;
    }

    // Generate nonce once per send action
    const nonce = generateMessageNonce();
    setCurrentNonce(nonce);
    setIsSending(true);

    try {
      await sendMessageMutation.mutateAsync({
        content: trimmedMessage,
        nickname,
        userId: currentUserId,
        replyToId: replyingTo?.id,
        image: selectedImage ?? undefined,
        video: undefined,
        audio: undefined,
        nonce,
      });

      // Clear input and state only on success
      setMessageInput('');
      setSelectedImage(null);
      setReplyingTo(null);
      setShowEmojiPicker(false);
      inputRef.current?.focus();
    } catch (error) {
      // Error is already logged and toasted by the mutation
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      toast.error(errorMessage);
    } finally {
      setIsSending(false);
      setCurrentNonce(null);
    }
  };

  const handleSendAudio = async (audioBlob: Blob) => {
    // Convert Blob to ExternalBlob with metadata
    const arrayBuffer = await audioBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const externalBlob = ExternalBlob.fromBytes(uint8Array);

    const audioFile: MediaFile = {
      file: externalBlob,
      originalName: generateFallbackFilename('audio/webm', 'audio'),
      contentType: 'audio/webm',
    };

    // Generate nonce for audio message
    const nonce = generateMessageNonce();

    try {
      await sendMessageMutation.mutateAsync({
        content: '',
        nickname,
        userId: currentUserId,
        replyToId: replyingTo?.id,
        image: undefined,
        video: undefined,
        audio: audioFile,
        nonce,
      });

      setReplyingTo(null);
      setShowAudioRecorder(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send audio';
      toast.error(errorMessage);
    }
  };

  const handleSendVideo = async (videoBlob: Blob) => {
    // Convert Blob to ExternalBlob with metadata
    const arrayBuffer = await videoBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const externalBlob = ExternalBlob.fromBytes(uint8Array);

    const videoFile: MediaFile = {
      file: externalBlob,
      originalName: generateFallbackFilename('video/webm', 'video'),
      contentType: 'video/webm',
    };

    // Generate nonce for video message
    const nonce = generateMessageNonce();

    try {
      await sendMessageMutation.mutateAsync({
        content: '',
        nickname,
        userId: currentUserId,
        replyToId: replyingTo?.id,
        image: undefined,
        video: videoFile,
        audio: undefined,
        nonce,
      });

      setReplyingTo(null);
      setShowVideoRecorder(false);
      setShowVideoUploader(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send video';
      toast.error(errorMessage);
    }
  };

  const handleEditMessage = async () => {
    if (!editingMessage) return;

    const trimmedContent = messageInput.trim();
    if (!trimmedContent && !selectedImage) {
      toast.error('Message cannot be empty');
      return;
    }

    try {
      await editMessageMutation.mutateAsync({
        messageId: editingMessage.id,
        userId: currentUserId,
        nickname,
        newContent: trimmedContent,
        newImage: selectedImage ?? undefined,
        newVideo: undefined,
        newAudio: undefined,
      });

      setMessageInput('');
      setSelectedImage(null);
      setEditingMessage(null);
      inputRef.current?.focus();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to edit message';
      toast.error(errorMessage);
    }
  };

  const handleDeleteMessage = async (message: MessageView) => {
    // Don't allow deleting optimistic messages
    if ((message as any).isOptimistic) {
      return;
    }

    try {
      await deleteMessageMutation.mutateAsync({
        messageId: message.id,
        userId: currentUserId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete message';
      toast.error(errorMessage);
    }
  };

  const handleReaction = async (messageId: bigint, emoji: string) => {
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;

    const existingReaction = message.reactions.find((r) => r.userId === currentUserId && r.emoji === emoji);

    try {
      if (existingReaction) {
        await removeReactionMutation.mutateAsync({
          messageId,
          userId: currentUserId,
          emoji,
        });
      } else {
        await addReactionMutation.mutateAsync({
          messageId,
          userId: currentUserId,
          emoji,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update reaction';
      toast.error(errorMessage);
    }
  };

  const handleReply = (message: MessageView) => {
    setReplyingTo(message);
    inputRef.current?.focus();
  };

  const handleEdit = (message: MessageView) => {
    setEditingMessage(message);
    setMessageInput(message.content);
    if (message.image) {
      setSelectedImage(message.image);
    }
    inputRef.current?.focus();
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setMessageInput('');
    setSelectedImage(null);
    inputRef.current?.focus();
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessageInput((prev) => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const handleJumpToMessage = (messageId: bigint) => {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const messageTop = messageElement.offsetTop;
      const containerHeight = container.clientHeight;
      const messageHeight = messageElement.clientHeight;

      // Scroll to center the message
      container.scrollTop = messageTop - containerHeight / 2 + messageHeight / 2;

      messageElement.classList.add('highlight-message');
      setTimeout(() => {
        messageElement.classList.remove('highlight-message');
      }, 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent double submission on Enter
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isSending) {
        if (editingMessage) {
          handleEditMessage();
        } else {
          handleSendMessage();
        }
      }
    }
  };

  // Suppress unused variable warning for currentNonce (used for deduplication tracking)
  void currentNonce;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading messages...</p>
        </div>
      </div>
    );
  }

  if (messagesError) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
          <div>
            <h3 className="text-lg font-semibold mb-2">Failed to Load Messages</h3>
            <p className="text-sm text-muted-foreground">
              {messagesError instanceof Error ? messagesError.message : 'An error occurred while loading messages'}
            </p>
          </div>
          <Button onClick={() => window.location.reload()}>Reload Page</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Messages Area - scrollable container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden chat-scroll-container"
        style={{
          paddingBottom: `${composerHeight + 16}px`,
        }}
      >
        <div className="px-4 py-4">
          <div className="max-w-4xl mx-auto space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-lg mb-2">No messages yet</p>
                <p className="text-sm">Be the first to send a message!</p>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id.toString()} id={`message-${message.id}`}>
                  <MessageBubble
                    message={message}
                    currentNickname={nickname}
                    currentUserId={currentUserId}
                    onReply={handleReply}
                    onEdit={handleEdit}
                    onDelete={handleDeleteMessage}
                    onReaction={handleReaction}
                    onJumpToMessage={handleJumpToMessage}
                    allMessages={messages}
                  />
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Fixed Input Area at bottom */}
      <div
        ref={composerRef}
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        style={{
          transform: keyboardOffset > 0 ? `translateY(-${keyboardOffset}px)` : 'none',
          transition: 'transform 0.2s ease-out',
        }}
      >
        <div className="max-w-4xl mx-auto p-4 space-y-3">
          {/* Reply Preview */}
          {replyingTo && (
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg text-sm">
              <span className="text-muted-foreground">Replying to {replyingTo.nickname}:</span>
              <span className="flex-1 truncate">{replyingTo.content}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReplyingTo(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Edit Mode Indicator */}
          {editingMessage && (
            <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg text-sm">
              <span className="text-primary font-medium">Editing message</span>
              <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                Cancel
              </Button>
            </div>
          )}

          {/* Selected Image Preview */}
          {selectedImage && (
            <div className="relative inline-block">
              <img
                src={selectedImage.file.getDirectURL()}
                alt="Selected"
                className="h-20 w-20 object-cover rounded-lg"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                onClick={() => setSelectedImage(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Input Form */}
          <form onSubmit={handleSendMessage} className="flex items-end gap-2">
            <div className="flex-1 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isSending}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={isSending || (!messageInput.trim() && !selectedImage)}
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>

              {/* Toolbar */}
              <div className="flex items-center gap-1">
                {/* Emoji Picker */}
                <div className="relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowEmojiPicker((prev) => !prev)}
                    title="Add emoji"
                  >
                    <Smile className="h-4 w-4" />
                  </Button>
                  {showEmojiPicker && (
                    <div className="absolute bottom-10 left-0 z-50">
                      <EmojiPicker
                        onSelect={handleEmojiSelect}
                        onClose={() => setShowEmojiPicker(false)}
                      />
                    </div>
                  )}
                </div>

                {/* Image Upload */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload image"
                >
                  <ImageIcon className="h-4 w-4" />
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageFileSelect}
                />

                {/* Audio Recorder */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setShowAudioRecorder(true);
                    setShowVideoRecorder(false);
                    setShowVideoUploader(false);
                  }}
                  title="Record audio"
                >
                  <Mic className="h-4 w-4" />
                </Button>

                {/* Video Recorder */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setShowVideoRecorder(true);
                    setShowAudioRecorder(false);
                    setShowVideoUploader(false);
                  }}
                  title="Record video"
                >
                  <Video className="h-4 w-4" />
                </Button>

                {/* Video Upload */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setShowVideoUploader(true);
                    setShowAudioRecorder(false);
                    setShowVideoRecorder(false);
                  }}
                  title="Upload video"
                >
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Audio Recorder Modal */}
      {showAudioRecorder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4">
          <div className="w-full max-w-md">
            <AudioRecorder
              onSend={handleSendAudio}
              onClose={() => setShowAudioRecorder(false)}
            />
          </div>
        </div>
      )}

      {/* Video Recorder Modal */}
      {showVideoRecorder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4">
          <div className="w-full max-w-md">
            <VideoRecorder
              onSend={handleSendVideo}
              onClose={() => setShowVideoRecorder(false)}
            />
          </div>
        </div>
      )}

      {/* Video Uploader Modal */}
      {showVideoUploader && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4">
          <div className="w-full max-w-md">
            <VideoUploader
              onSend={handleSendVideo}
              onClose={() => setShowVideoUploader(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
