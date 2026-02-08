import { useEffect, useRef, useState } from 'react';
import { Send, Smile, Image as ImageIcon, X, Upload, AlertCircle, Mic, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  useMessages, 
  useSendMessage, 
  useEditMessage, 
  useDeleteMessage, 
  useMessageTTL, 
  useRoomExists,
  useAddReaction,
  useRemoveReaction
} from '../hooks/useQueries';
import { useActor } from '../hooks/useActor';
import { useVisualViewportOffset } from '../hooks/useVisualViewportOffset';
import MessageBubble from './MessageBubble';
import EmojiPicker from './EmojiPicker';
import MediaPicker from './MediaPicker';
import AudioRecorder from './AudioRecorder';
import VideoUploader from './VideoUploader';
import type { MessageView } from '../backend';
import { ExternalBlob } from '../backend';
import { sanitizeChatError } from '../utils/chatErrorMessages';
import { toastErrorOnce, toastSuccessOnce } from '../utils/toastOnce';

interface ChatRoomProps {
  roomId: string;
  nickname: string;
  onLeave: () => void;
  onNicknameChange: (newNickname: string) => void;
}

interface UnsentMessagePayload {
  content: string;
  replyToId: bigint | null;
  image: ExternalBlob | null;
  video: ExternalBlob | null;
  audio: ExternalBlob | null;
}

export default function ChatRoom({ roomId, nickname }: ChatRoomProps) {
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [showVideoUploader, setShowVideoUploader] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [unsentPayload, setUnsentPayload] = useState<UnsentMessagePayload | null>(null);
  const [replyingTo, setReplyingTo] = useState<MessageView | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessageView | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<MessageView | null>(null);
  const [selectedImage, setSelectedImage] = useState<ExternalBlob | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<ExternalBlob | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<ExternalBlob | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousMessageCountRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const { actor, isFetching: isActorFetching } = useActor();
  const { data: messages = [], isLoading, isError, error, refetch } = useMessages(roomId);
  const { data: roomExists } = useRoomExists(roomId);
  const { data: messageTTL } = useMessageTTL();
  const sendMessage = useSendMessage();
  const editMessage = useEditMessage();
  const deleteMessage = useDeleteMessage();
  const addReaction = useAddReaction();
  const removeReaction = useRemoveReaction();
  const { keyboardOffset, isKeyboardOpen } = useVisualViewportOffset();

  // Generate a unique user ID for reactions (stored in localStorage)
  const [userId] = useState(() => {
    const stored = localStorage.getItem('chatUserId');
    if (stored) return stored;
    const newId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('chatUserId', newId);
    return newId;
  });

  // Calculate message TTL in hours
  const messageTTLHours = messageTTL ? Number(messageTTL / 3_600_000_000_000n) : 24;

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    
    // Set height based on scrollHeight, with min and max constraints
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 40), 200);
    textarea.style.height = `${newHeight}px`;
  }, [message]);

  // Check if user is near bottom of scroll area
  const checkIfNearBottom = () => {
    const scrollArea = scrollViewportRef.current;
    if (!scrollArea) return false;

    const threshold = 150; // pixels from bottom
    const isNear = scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight < threshold;
    isNearBottomRef.current = isNear;
    return isNear;
  };

  // Scroll to bottom helper
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current && !isUserScrollingRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    }
  };

  // Jump to message handler with refetch-and-retry logic
  const handleJumpToMessage = async (messageId: bigint) => {
    const targetElement = document.getElementById(`message-${messageId}`);
    
    if (targetElement) {
      // Message found - instant jump
      targetElement.scrollIntoView({ behavior: 'auto', block: 'center' });
      return;
    }

    // Message not found - refetch and retry
    try {
      await refetch();
      
      // Wait a bit for DOM to update
      setTimeout(() => {
        const retryElement = document.getElementById(`message-${messageId}`);
        
        if (retryElement) {
          retryElement.scrollIntoView({ behavior: 'auto', block: 'center' });
        } else {
          // Still not found after refetch
          toastErrorOnce('Original message unavailable', 'jump-message-unavailable');
        }
      }, 100);
    } catch (error) {
      console.error('Failed to refetch messages:', error);
      toastErrorOnce('Original message unavailable', 'jump-message-error');
    }
  };

  // Detect user scrolling
  useEffect(() => {
    const scrollArea = scrollViewportRef.current;
    if (!scrollArea) return;

    const handleScroll = () => {
      checkIfNearBottom();

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      isUserScrollingRef.current = true;

      scrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 1000);
    };

    scrollArea.addEventListener('scroll', handleScroll);
    return () => {
      scrollArea.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > previousMessageCountRef.current) {
      // Use instant scroll for first load, smooth for new messages
      const behavior = previousMessageCountRef.current === 0 ? 'instant' : 'smooth';
      setTimeout(() => {
        isUserScrollingRef.current = false;
        scrollToBottom(behavior);
      }, 50);
    }
    previousMessageCountRef.current = messages.length;
  }, [messages]);

  // Scroll to bottom when input is focused (keyboard opens) - only if near bottom
  const handleInputFocus = () => {
    checkIfNearBottom();
    
    if (isNearBottomRef.current) {
      setTimeout(() => {
        isUserScrollingRef.current = false;
        scrollToBottom('smooth');
      }, 300);
    }
  };

  // Handle keyboard open/close - only auto-scroll if user was near bottom
  useEffect(() => {
    if (isKeyboardOpen && isNearBottomRef.current) {
      setTimeout(() => {
        scrollToBottom('smooth');
      }, 100);
    }
  }, [isKeyboardOpen]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toastErrorOnce('Please select a valid image file (JPEG, PNG, GIF, or WEBP)', 'invalid-image-type');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toastErrorOnce('Image size must be less than 5MB', 'image-too-large');
      return;
    }

    setIsUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      const blob = ExternalBlob.fromBytes(uint8Array).withUploadProgress((percentage) => {
        setUploadProgress(percentage);
      });
      
      setSelectedImage(blob);
      
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      
      toastSuccessOnce('Image selected! Click send to share.', 'image-selected');
    } catch (error) {
      console.error('Error processing image:', error);
      toastErrorOnce('Failed to process image', 'image-process-error');
    } finally {
      setIsUploading(false);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        
        const file = item.getAsFile();
        if (!file) continue;

        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
          toastErrorOnce('Please paste a valid image format (JPEG, PNG, GIF, or WEBP)', 'paste-invalid-type');
          return;
        }

        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
          toastErrorOnce('Pasted image size must be less than 5MB', 'paste-too-large');
          return;
        }

        setIsUploading(true);
        try {
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          const blob = ExternalBlob.fromBytes(uint8Array).withUploadProgress((percentage) => {
            setUploadProgress(percentage);
          });
          
          setSelectedImage(blob);
          
          const previewUrl = URL.createObjectURL(file);
          setImagePreview(previewUrl);
          
          toastSuccessOnce('Image pasted! Click send to share.', 'image-pasted');
        } catch (error) {
          console.error('Error processing pasted image:', error);
          toastErrorOnce('Failed to process pasted image', 'paste-process-error');
        } finally {
          setIsUploading(false);
        }
        
        return;
      }
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
    setUploadProgress(0);
  };

  const handleRemoveVideo = () => {
    setSelectedVideo(null);
    if (videoPreview) {
      URL.revokeObjectURL(videoPreview);
      setVideoPreview(null);
    }
    setUploadProgress(0);
  };

  const handleVideoSend = async (videoBlob: Blob) => {
    if (!actor) {
      toastErrorOnce('Connection not ready. Please wait and try again.', 'video-actor-not-ready');
      return;
    }

    // Validate nickname before sending
    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
      toastErrorOnce('Nickname cannot be empty', 'video-empty-nickname');
      return;
    }
    if (trimmedNickname.length > 20) {
      toastErrorOnce('Nickname cannot exceed 20 characters', 'video-nickname-too-long');
      return;
    }

    setIsUploading(true);
    try {
      console.log('Processing video blob:', videoBlob.size, 'bytes, type:', videoBlob.type);
      
      const arrayBuffer = await videoBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const blob = ExternalBlob.fromBytes(uint8Array).withUploadProgress((percentage) => {
        setUploadProgress(percentage);
      });
      
      setSelectedVideo(blob);
      setShowVideoUploader(false);
      
      // Wait for upload to complete before sending
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Send video message
      await sendMessage.mutateAsync({ 
        roomId, 
        content: '🎬 Video message', 
        nickname: trimmedNickname,
        video: blob
      });
      
      setSelectedVideo(null);
      setUploadProgress(0);
      toastSuccessOnce('Video message sent!', 'video-sent');
      
      // Faster scroll after send
      setTimeout(() => {
        isUserScrollingRef.current = false;
        scrollToBottom('smooth');
      }, 50);
    } catch (error) {
      console.error('Error sending video:', error);
      const sanitizedError = sanitizeChatError(error);
      toastErrorOnce(sanitizedError, 'video-send-error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAudioSend = async (audioBlob: Blob) => {
    if (!actor) {
      toastErrorOnce('Connection not ready. Please wait and try again.', 'audio-actor-not-ready');
      return;
    }

    // Validate nickname before sending
    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
      toastErrorOnce('Nickname cannot be empty', 'audio-empty-nickname');
      return;
    }
    if (trimmedNickname.length > 20) {
      toastErrorOnce('Nickname cannot exceed 20 characters', 'audio-nickname-too-long');
      return;
    }

    setIsUploading(true);
    try {
      console.log('Processing audio blob:', audioBlob.size, 'bytes, type:', audioBlob.type);
      
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const blob = ExternalBlob.fromBytes(uint8Array).withUploadProgress((percentage) => {
        setUploadProgress(percentage);
      });
      
      setSelectedAudio(blob);
      setShowAudioRecorder(false);
      
      // Wait for upload to complete before sending
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Send audio message
      await sendMessage.mutateAsync({ 
        roomId, 
        content: '🎵 Audio message', 
        nickname: trimmedNickname,
        audio: blob
      });
      
      setSelectedAudio(null);
      setUploadProgress(0);
      toastSuccessOnce('Audio message sent!', 'audio-sent');
      
      // Faster scroll after send
      setTimeout(() => {
        isUserScrollingRef.current = false;
        scrollToBottom('smooth');
      }, 50);
    } catch (error) {
      console.error('Error sending audio:', error);
      const sanitizedError = sanitizeChatError(error);
      toastErrorOnce(sanitizedError, 'audio-send-error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage && !selectedImage && !selectedVideo && !selectedAudio) return;

    if (!actor) {
      toastErrorOnce('Connection not ready. Please wait a moment and try again.', 'send-actor-not-ready');
      return;
    }

    if (roomExists === false) {
      toastErrorOnce('Room does not exist. Please check the room code.', 'send-room-not-exist');
      return;
    }

    // Validate nickname before sending
    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
      toastErrorOnce('Nickname cannot be empty', 'send-empty-nickname');
      return;
    }
    if (trimmedNickname.length > 20) {
      toastErrorOnce('Nickname cannot exceed 20 characters', 'send-nickname-too-long');
      return;
    }

    // Block sending while uploads are in progress
    if (isUploading || uploadProgress > 0 && uploadProgress < 100) {
      toastErrorOnce('Please wait for upload to complete', 'send-upload-in-progress');
      return;
    }

    const messageToSend = message; // Keep original formatting with newlines
    const imageToSend = selectedImage;
    const videoToSend = selectedVideo;
    const audioToSend = selectedAudio;
    const replyToSend = replyingTo;
    const editToSend = editingMessage;
    
    // Clear input immediately for instant feedback
    setMessage('');
    handleRemoveImage();
    handleRemoveVideo();
    setShowEmojiPicker(false);
    setShowMediaPicker(false);
    setSendError(null);
    setUnsentPayload(null);
    textareaRef.current?.focus();

    try {
      if (editToSend) {
        // Edit with optimistic update
        await editMessage.mutateAsync({ 
          roomId, 
          messageId: editToSend.id, 
          newContent: messageToSend,
          newImage: imageToSend,
          newVideo: videoToSend,
          newAudio: audioToSend
        });
        setEditingMessage(null);
        toastSuccessOnce('Message edited', 'message-edited');
      } else {
        // Send with optimistic update - message appears instantly
        await sendMessage.mutateAsync({ 
          roomId, 
          content: messageToSend || (videoToSend ? '🎬 Video' : audioToSend ? '🎵 Audio' : '📷 Image'), 
          nickname: trimmedNickname,
          replyToId: replyToSend?.id ?? null,
          image: imageToSend,
          video: videoToSend,
          audio: audioToSend
        });
        setReplyingTo(null);
      }
      
      // Faster scroll after send
      setTimeout(() => {
        isUserScrollingRef.current = false;
        scrollToBottom('smooth');
      }, 50);
    } catch (error) {
      // Store the unsent payload for retry
      const payload: UnsentMessagePayload = {
        content: messageToSend,
        replyToId: replyToSend?.id ?? null,
        image: imageToSend,
        video: videoToSend,
        audio: audioToSend,
      };
      setUnsentPayload(payload);
      
      // Restore all state on error
      setMessage(messageToSend);
      if (imageToSend) {
        setSelectedImage(imageToSend);
      }
      if (videoToSend) {
        setSelectedVideo(videoToSend);
      }
      if (audioToSend) {
        setSelectedAudio(audioToSend);
      }
      if (replyToSend) {
        setReplyingTo(replyToSend);
      }
      if (editToSend) {
        setEditingMessage(editToSend);
      }
      const sanitizedError = sanitizeChatError(error);
      setSendError(sanitizedError);
      
      // Show toast for edit failures (send failures already show inline error)
      if (editToSend) {
        toastErrorOnce(sanitizedError, 'edit-message-error');
      }
    }
  };

  const handleRetry = async () => {
    if (!unsentPayload) return;
    
    setSendError(null);
    
    try {
      // Validate nickname before retrying
      const trimmedNickname = nickname.trim();
      if (!trimmedNickname) {
        toastErrorOnce('Nickname cannot be empty', 'retry-empty-nickname');
        return;
      }
      if (trimmedNickname.length > 20) {
        toastErrorOnce('Nickname cannot exceed 20 characters', 'retry-nickname-too-long');
        return;
      }

      await sendMessage.mutateAsync({ 
        roomId, 
        content: unsentPayload.content || (unsentPayload.video ? '🎬 Video' : unsentPayload.audio ? '🎵 Audio' : '📷 Image'), 
        nickname: trimmedNickname,
        replyToId: unsentPayload.replyToId,
        image: unsentPayload.image,
        video: unsentPayload.video,
        audio: unsentPayload.audio
      });
      
      // Clear on success
      setMessage('');
      setUnsentPayload(null);
      handleRemoveImage();
      handleRemoveVideo();
      setReplyingTo(null);
      
      // Faster scroll after send
      setTimeout(() => {
        isUserScrollingRef.current = false;
        scrollToBottom('smooth');
      }, 50);
    } catch (error) {
      const sanitizedError = sanitizeChatError(error);
      setSendError(sanitizedError);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const handleMediaSelect = (mediaUrl: string) => {
    const blob = ExternalBlob.fromURL(mediaUrl);
    setSelectedImage(blob);
    setImagePreview(mediaUrl);
    setShowMediaPicker(false);
    toastSuccessOnce('Media selected! Click send to share.', 'media-selected');
  };

  const handleReply = (msg: MessageView) => {
    setReplyingTo(msg);
    setEditingMessage(null);
    textareaRef.current?.focus();
  };

  const handleEdit = (msg: MessageView) => {
    setEditingMessage(msg);
    setReplyingTo(null);
    setMessage(msg.content);
    if (msg.imageUrl) {
      setSelectedImage(msg.imageUrl);
      setImagePreview(msg.imageUrl.getDirectURL());
    }
    if (msg.videoUrl) {
      setSelectedVideo(msg.videoUrl);
      setVideoPreview(msg.videoUrl.getDirectURL());
    }
    if (msg.audioUrl) {
      setSelectedAudio(msg.audioUrl);
    }
    textareaRef.current?.focus();
  };

  const handleDelete = (msg: MessageView) => {
    setMessageToDelete(msg);
  };

  const confirmDelete = async () => {
    if (!messageToDelete) return;

    try {
      await deleteMessage.mutateAsync({ roomId, messageId: messageToDelete.id });
      setMessageToDelete(null);
      toastSuccessOnce('Message deleted', 'message-deleted');
    } catch (error) {
      console.error('Error deleting message:', error);
      const sanitizedError = sanitizeChatError(error);
      toastErrorOnce(sanitizedError, 'delete-message-error');
    }
  };

  const handleReaction = async (messageId: bigint, emoji: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;

    const existingReaction = msg.reactions.find(r => r.userId === userId && r.emoji === emoji);

    try {
      if (existingReaction) {
        await removeReaction.mutateAsync({ roomId, messageId, emoji });
      } else {
        await addReaction.mutateAsync({ roomId, messageId, emoji });
      }
    } catch (error) {
      console.error('Error updating reaction:', error);
      const sanitizedError = sanitizeChatError(error);
      toastErrorOnce(sanitizedError, 'reaction-error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading messages...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {sanitizeChatError(error)}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <ScrollArea 
        className="flex-1 px-4"
        ref={scrollViewportRef}
      >
        <div className="py-4 space-y-4 max-w-4xl mx-auto">
          {messages.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <p className="text-muted-foreground">No messages yet</p>
              <p className="text-sm text-muted-foreground">
                Be the first to send a message!
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg.id.toString()}
                message={msg}
                currentNickname={nickname}
                currentUserId={userId}
                onReply={handleReply}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onReaction={handleReaction}
                onJumpToMessage={handleJumpToMessage}
                allMessages={messages}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div 
        ref={inputContainerRef}
        className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 transition-all duration-200 ease-out"
        style={{
          paddingBottom: `${keyboardOffset}px`,
        }}
      >
        <div className="max-w-4xl mx-auto p-4 space-y-3">
          {/* Send Error Alert */}
          {sendError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{sendError}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  disabled={sendMessage.isPending}
                >
                  {sendMessage.isPending ? 'Retrying...' : 'Retry'}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Reply/Edit Indicator */}
          {(replyingTo || editingMessage) && (
            <div className="flex items-center justify-between p-2 bg-muted rounded-lg text-sm">
              <span className="text-muted-foreground">
                {editingMessage ? 'Editing message' : `Replying to ${replyingTo?.nickname}`}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReplyingTo(null);
                  setEditingMessage(null);
                  setMessage('');
                  handleRemoveImage();
                  handleRemoveVideo();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Image Preview */}
          {imagePreview && (
            <div className="relative inline-block">
              <img
                src={imagePreview}
                alt="Preview"
                className="max-h-32 rounded-lg border"
              />
              <Button
                variant="destructive"
                size="sm"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                onClick={handleRemoveImage}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Video Preview */}
          {videoPreview && (
            <div className="relative inline-block">
              <video
                src={videoPreview}
                className="max-h-32 rounded-lg border"
                controls
              />
              <Button
                variant="destructive"
                size="sm"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                onClick={handleRemoveVideo}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Upload Progress */}
          {isUploading && uploadProgress > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Input Row */}
          <div className="flex gap-2 items-end">
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                disabled={isUploading}
              >
                <Smile className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                <ImageIcon className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowMediaPicker(!showMediaPicker)}
                disabled={isUploading}
              >
                <Upload className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowAudioRecorder(!showAudioRecorder)}
                disabled={isUploading}
              >
                <Mic className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowVideoUploader(!showVideoUploader)}
                disabled={isUploading}
              >
                <Video className="h-5 w-5" />
              </Button>
            </div>

            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onPaste={handlePaste}
              onFocus={handleInputFocus}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Type a message..."
              className="flex-1 min-h-[40px] max-h-[200px] resize-none"
              disabled={isUploading}
            />

            <Button
              onClick={handleSendMessage}
              disabled={
                sendMessage.isPending || 
                isUploading || 
                (!message.trim() && !selectedImage && !selectedVideo && !selectedAudio)
              }
              size="icon"
              className="shrink-0"
            >
              {sendMessage.isPending ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Emoji Picker */}
          {showEmojiPicker && (
            <EmojiPicker
              onSelect={handleEmojiSelect}
              onClose={() => setShowEmojiPicker(false)}
            />
          )}

          {/* Media Picker */}
          {showMediaPicker && (
            <MediaPicker
              onSelect={handleMediaSelect}
              onClose={() => setShowMediaPicker(false)}
            />
          )}

          {/* Audio Recorder */}
          {showAudioRecorder && (
            <AudioRecorder
              onSend={handleAudioSend}
              onClose={() => setShowAudioRecorder(false)}
            />
          )}

          {/* Video Uploader */}
          {showVideoUploader && (
            <VideoUploader
              onSend={handleVideoSend}
              onClose={() => setShowVideoUploader(false)}
            />
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!messageToDelete} onOpenChange={() => setMessageToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this message? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageSelect}
        className="hidden"
      />
    </div>
  );
}
