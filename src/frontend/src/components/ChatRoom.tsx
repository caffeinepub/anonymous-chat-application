import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Send, 
  Image as ImageIcon, 
  Smile, 
  Loader2, 
  Mic, 
  Video,
  X,
  AlertCircle
} from 'lucide-react';
import { 
  useMessages, 
  useSendMessage, 
  useEditMessage, 
  useDeleteMessage,
  useAddReaction,
  useRemoveReaction
} from '../hooks/useQueries';
import MessageBubble from './MessageBubble';
import EmojiPicker from './EmojiPicker';
import MediaPicker from './MediaPicker';
import AudioRecorder from './AudioRecorder';
import VideoRecorder from './VideoRecorder';
import VideoUploader from './VideoUploader';
import type { MessageView } from '../backend';
import { ExternalBlob } from '../backend';
import { toast } from 'sonner';
import { useVisualViewportOffset } from '../hooks/useVisualViewportOffset';
import { normalizeRoomId } from '../utils/roomId';
import { generateMessageNonce } from '../utils/messageNonce';

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
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const [showVideoUploader, setShowVideoUploader] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageView | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessageView | null>(null);
  const [selectedImage, setSelectedImage] = useState<ExternalBlob | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [currentNonce, setCurrentNonce] = useState<string | null>(null);
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const viewportState = useVisualViewportOffset();
  const keyboardOffset = viewportState.keyboardOffset;
  
  const currentUserId = getUserId();
  
  const { data: messages = [], isLoading, error: messagesError } = useMessages(normalizedRoomId);
  const sendMessageMutation = useSendMessage();
  const editMessageMutation = useEditMessage();
  const deleteMessageMutation = useDeleteMessage();
  const addReactionMutation = useAddReaction();
  const removeReactionMutation = useRemoveReaction();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
        roomId: normalizedRoomId,
        content: trimmedMessage,
        nickname,
        replyToId: replyingTo?.id ?? null,
        image: selectedImage,
        video: null,
        audio: null,
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
    // Convert Blob to ExternalBlob
    const arrayBuffer = await audioBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const externalBlob = ExternalBlob.fromBytes(uint8Array);
    
    // Generate nonce for audio message
    const nonce = generateMessageNonce();
    
    try {
      await sendMessageMutation.mutateAsync({
        roomId: normalizedRoomId,
        content: '',
        nickname,
        replyToId: replyingTo?.id ?? null,
        image: null,
        video: null,
        audio: externalBlob,
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
    // Convert Blob to ExternalBlob
    const arrayBuffer = await videoBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const externalBlob = ExternalBlob.fromBytes(uint8Array);
    
    // Generate nonce for video message
    const nonce = generateMessageNonce();
    
    try {
      await sendMessageMutation.mutateAsync({
        roomId: normalizedRoomId,
        content: '',
        nickname,
        replyToId: replyingTo?.id ?? null,
        image: null,
        video: externalBlob,
        audio: null,
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
        roomId: normalizedRoomId,
        messageId: editingMessage.id,
        newContent: trimmedContent,
        newImage: selectedImage,
        newVideo: null,
        newAudio: null,
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
        roomId: normalizedRoomId,
        messageId: message.id,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete message';
      toast.error(errorMessage);
    }
  };

  const handleReaction = async (messageId: bigint, emoji: string) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    const existingReaction = message.reactions.find(
      r => r.userId === currentUserId && r.emoji === emoji
    );

    try {
      if (existingReaction) {
        await removeReactionMutation.mutateAsync({
          roomId: normalizedRoomId,
          messageId,
          emoji,
        });
      } else {
        await addReactionMutation.mutateAsync({
          roomId: normalizedRoomId,
          messageId,
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
    if (message.imageUrl) {
      setSelectedImage(message.imageUrl);
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
    setMessageInput(prev => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const handleMediaSelect = async (url: string) => {
    try {
      // Convert URL to ExternalBlob
      const response = await fetch(url);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const externalBlob = ExternalBlob.fromBytes(uint8Array);
      
      setSelectedImage(externalBlob);
      setShowMediaPicker(false);
      inputRef.current?.focus();
    } catch (error) {
      console.error('Error loading media:', error);
      toast.error('Failed to load media');
    }
  };

  const handleJumpToMessage = (messageId: bigint) => {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
          <Button onClick={() => window.location.reload()}>
            Reload Page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Messages Area */}
      <ScrollArea 
        ref={scrollAreaRef}
        className="flex-1 px-4 py-4"
      >
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
      </ScrollArea>

      {/* Input Area */}
      <div 
        className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        style={{ 
          paddingBottom: keyboardOffset > 0 ? `${keyboardOffset}px` : 'env(safe-area-inset-bottom, 0px)'
        }}
      >
        <div className="max-w-4xl mx-auto p-4 space-y-3">
          {/* Reply Preview */}
          {replyingTo && (
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg text-sm">
              <span className="text-muted-foreground">Replying to {replyingTo.nickname}:</span>
              <span className="flex-1 truncate">{replyingTo.content}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setReplyingTo(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Edit Mode Indicator */}
          {editingMessage && (
            <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg text-sm">
              <span className="text-primary font-medium">Editing message</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelEdit}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Selected Image Preview */}
          {selectedImage && (
            <div className="relative inline-block">
              <img
                src={selectedImage.getDirectURL()}
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
            <div className="flex-1 flex items-end gap-2">
              {/* Media Buttons */}
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowMediaPicker(!showMediaPicker)}
                  disabled={isSending || editingMessage !== null}
                >
                  <ImageIcon className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowAudioRecorder(!showAudioRecorder)}
                  disabled={isSending || editingMessage !== null}
                >
                  <Mic className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowVideoRecorder(!showVideoRecorder)}
                  disabled={isSending || editingMessage !== null}
                >
                  <Video className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  disabled={isSending}
                >
                  <Smile className="h-5 w-5" />
                </Button>
              </div>

              {/* Message Input */}
              <Input
                ref={inputRef}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={editingMessage ? "Edit your message..." : "Type a message..."}
                className="flex-1"
                disabled={isSending}
              />
            </div>

            {/* Send/Edit Button */}
            <Button 
              type="submit" 
              size="icon"
              disabled={isSending || (!messageInput.trim() && !selectedImage)}
              onClick={editingMessage ? handleEditMessage : undefined}
            >
              {isSending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* Emoji Picker Overlay */}
      {showEmojiPicker && (
        <div className="absolute bottom-20 left-4 z-50">
          <EmojiPicker
            onSelect={handleEmojiSelect}
            onClose={() => setShowEmojiPicker(false)}
          />
        </div>
      )}

      {/* Media Picker Overlay */}
      {showMediaPicker && (
        <div className="absolute bottom-20 left-4 z-50">
          <MediaPicker
            onSelect={handleMediaSelect}
            onClose={() => setShowMediaPicker(false)}
          />
        </div>
      )}

      {/* Audio Recorder Overlay */}
      {showAudioRecorder && (
        <div className="absolute inset-0 bg-background/95 backdrop-blur z-50 flex items-center justify-center p-4">
          <AudioRecorder
            onSend={handleSendAudio}
            onClose={() => setShowAudioRecorder(false)}
          />
        </div>
      )}

      {/* Video Recorder Overlay */}
      {showVideoRecorder && (
        <div className="absolute inset-0 bg-background/95 backdrop-blur z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Record or Upload Video</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowVideoRecorder(false);
                  setShowVideoUploader(false);
                }}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="flex gap-2 justify-center">
              <Button
                variant={!showVideoUploader ? "default" : "outline"}
                onClick={() => setShowVideoUploader(false)}
              >
                Record Video
              </Button>
              <Button
                variant={showVideoUploader ? "default" : "outline"}
                onClick={() => setShowVideoUploader(true)}
              >
                Upload Video
              </Button>
            </div>

            {showVideoUploader ? (
              <VideoUploader
                onSend={handleSendVideo}
                onClose={() => {
                  setShowVideoRecorder(false);
                  setShowVideoUploader(false);
                }}
              />
            ) : (
              <VideoRecorder
                onSend={handleSendVideo}
                onClose={() => {
                  setShowVideoRecorder(false);
                  setShowVideoUploader(false);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
