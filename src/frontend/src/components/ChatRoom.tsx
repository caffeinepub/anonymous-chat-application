import { useEffect, useRef, useState } from 'react';
import { Send, Smile, Image as ImageIcon, X, Upload, AlertCircle, Mic } from 'lucide-react';
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
import { toast } from 'sonner';
import MessageBubble from './MessageBubble';
import EmojiPicker from './EmojiPicker';
import MediaPicker from './MediaPicker';
import AudioRecorder from './AudioRecorder';
import type { MessageView } from '../backend';
import { ExternalBlob } from '../backend';

interface ChatRoomProps {
  roomId: string;
  nickname: string;
  onLeave: () => void;
  onNicknameChange: (newNickname: string) => void;
}

export default function ChatRoom({ roomId, nickname }: ChatRoomProps) {
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<MessageView | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessageView | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<MessageView | null>(null);
  const [selectedImage, setSelectedImage] = useState<ExternalBlob | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<ExternalBlob | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousMessageCountRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { actor, isFetching: isActorFetching } = useActor();
  const { data: messages = [], isLoading, isError, error, refetch } = useMessages(roomId);
  const { data: roomExists } = useRoomExists(roomId);
  const { data: messageTTL } = useMessageTTL();
  const sendMessage = useSendMessage();
  const editMessage = useEditMessage();
  const deleteMessage = useDeleteMessage();
  const addReaction = useAddReaction();
  const removeReaction = useRemoveReaction();

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

  // Scroll to bottom helper
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current && !isUserScrollingRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    }
  };

  // Detect user scrolling
  useEffect(() => {
    const scrollArea = scrollViewportRef.current;
    if (!scrollArea) return;

    const handleScroll = () => {
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

  // Handle viewport resize (keyboard open/close on mobile)
  useEffect(() => {
    const handleResize = () => {
      setTimeout(() => {
        isUserScrollingRef.current = false;
        scrollToBottom('instant');
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      }
    };
  }, []);

  // Scroll to bottom when input is focused (keyboard opens)
  const handleInputFocus = () => {
    setTimeout(() => {
      isUserScrollingRef.current = false;
      scrollToBottom('instant');
    }, 200);
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please select a valid image file (JPEG, PNG, GIF, or WEBP)');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      const blob = ExternalBlob.fromBytes(uint8Array).withUploadProgress((percentage) => {
        setUploadProgress(percentage);
      });
      
      setSelectedImage(blob);
      
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      
      toast.success('Image selected! Click send to share.');
    } catch (error) {
      console.error('Error processing image:', error);
      toast.error('Failed to process image');
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
          toast.error('Please paste a valid image format (JPEG, PNG, GIF, or WEBP)');
          return;
        }

        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
          toast.error('Pasted image size must be less than 5MB');
          return;
        }

        try {
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          const blob = ExternalBlob.fromBytes(uint8Array).withUploadProgress((percentage) => {
            setUploadProgress(percentage);
          });
          
          setSelectedImage(blob);
          
          const previewUrl = URL.createObjectURL(file);
          setImagePreview(previewUrl);
          
          toast.success('Image pasted! Click send to share.');
        } catch (error) {
          console.error('Error processing pasted image:', error);
          toast.error('Failed to process pasted image');
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

  const handleAudioSend = async (audioBlob: Blob) => {
    try {
      console.log('Processing audio blob:', audioBlob.size, 'bytes, type:', audioBlob.type);
      
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const blob = ExternalBlob.fromBytes(uint8Array).withUploadProgress((percentage) => {
        setUploadProgress(percentage);
      });
      
      setSelectedAudio(blob);
      setShowAudioRecorder(false);
      
      // Auto-send audio message with optimistic update
      await sendMessage.mutateAsync({ 
        roomId, 
        content: '🎵 Audio message', 
        nickname,
        audio: blob
      });
      
      setSelectedAudio(null);
      setUploadProgress(0);
      toast.success('Audio message sent!');
      
      // Faster scroll after send
      setTimeout(() => {
        isUserScrollingRef.current = false;
        scrollToBottom('smooth');
      }, 50);
    } catch (error) {
      console.error('Error sending audio:', error);
      toast.error('Failed to send audio message');
    }
  };

  const handleSendMessage = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage && !selectedImage) return;

    if (!actor) {
      toast.error('Connection not ready. Please wait a moment and try again.');
      return;
    }

    if (roomExists === false) {
      toast.error('Room does not exist. Please check the room code.');
      return;
    }

    const messageToSend = message; // Keep original formatting with newlines
    const imageToSend = selectedImage;
    
    // Clear input immediately for instant feedback
    setMessage('');
    handleRemoveImage();
    setShowEmojiPicker(false);
    setShowMediaPicker(false);
    setSendError(null);
    textareaRef.current?.focus();

    try {
      if (editingMessage) {
        // Edit with optimistic update
        await editMessage.mutateAsync({ 
          roomId, 
          messageId: editingMessage.id, 
          newContent: messageToSend,
          newImage: imageToSend
        });
        setEditingMessage(null);
        toast.success('Message edited');
      } else {
        // Send with optimistic update - message appears instantly
        await sendMessage.mutateAsync({ 
          roomId, 
          content: messageToSend || '📷 Image', 
          nickname,
          replyToId: replyingTo?.id ?? null,
          image: imageToSend
        });
        setReplyingTo(null);
      }
      
      // Faster scroll after send
      setTimeout(() => {
        isUserScrollingRef.current = false;
        scrollToBottom('smooth');
      }, 50);
    } catch (error) {
      // Restore message on error
      setMessage(messageToSend);
      if (imageToSend) {
        setSelectedImage(imageToSend);
      }
      const errorMessage = error instanceof Error ? error.message : editingMessage ? 'Failed to edit message' : 'Failed to send message';
      setSendError(errorMessage);
      toast.error(errorMessage);
      console.error('Message operation error:', error);
    }
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
    textareaRef.current?.focus();
  };

  const handleDeleteClick = (msg: MessageView) => {
    setMessageToDelete(msg);
  };

  const handleConfirmDelete = async () => {
    if (!messageToDelete) return;

    try {
      // Optimistic delete - message disappears instantly
      await deleteMessage.mutateAsync({
        roomId,
        messageId: messageToDelete.id,
      });
      toast.success('Message deleted');
      setMessageToDelete(null);
    } catch (error) {
      console.error('Failed to delete message:', error);
      toast.error('Failed to delete message');
    }
  };

  const handleCancelDelete = () => {
    setMessageToDelete(null);
  };

  const handleReaction = async (messageId: bigint, emoji: string) => {
    try {
      const msg = messages.find(m => m.id === messageId);
      if (!msg) return;

      const existingReaction = msg.reactions.find(
        r => r.userId === userId && r.emoji === emoji
      );

      if (existingReaction) {
        // Optimistic remove - reaction disappears instantly
        await removeReaction.mutateAsync({
          roomId,
          messageId,
          userId,
          emoji,
        });
      } else {
        // Optimistic add - reaction appears instantly
        await addReaction.mutateAsync({
          roomId,
          messageId,
          userId,
          emoji,
        });
      }
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
      toast.error('Failed to update reaction');
    }
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setMessage('');
    handleRemoveImage();
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessage((prev) => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const handleMediaSelect = (mediaUrl: string) => {
    if (mediaUrl.includes('blob:') || mediaUrl.includes('/blobs/')) {
      try {
        const blob = ExternalBlob.fromURL(mediaUrl);
        setSelectedImage(blob);
        setImagePreview(mediaUrl);
        toast.success('Sticker selected! Click send to share.');
      } catch (error) {
        console.error('Error loading sticker:', error);
        toast.error('Failed to load sticker');
      }
    } else {
      setMessage((prev) => (prev ? `${prev} ${mediaUrl}` : mediaUrl));
    }
    setShowMediaPicker(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift + Enter: insert newline (default behavior)
    // Enter alone: send message
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
    if (e.key === 'Escape') {
      if (editingMessage) {
        handleCancelEdit();
      } else if (replyingTo) {
        handleCancelReply();
      }
    }
  };

  const handleRetry = () => {
    refetch();
  };

  const getMessagePreview = (msg: MessageView) => {
    const text = msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content;
    return text;
  };

  const isActorLoading = !actor && isActorFetching;
  const showConnectionError = !actor && !isActorFetching;

  return (
    <div className="flex h-full w-full flex-col">
      {/* Messages Area - Scrollable, fills available space */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="container h-full max-w-5xl">
          <ScrollArea className="h-full" ref={scrollViewportRef}>
            <div className="p-4 pb-2">
              {showConnectionError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-semibold">Connection Error</p>
                      <p>Failed to connect to the backend. Please check your connection.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRetry}
                        className="mt-2"
                      >
                        Retry Connection
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {isError && !showConnectionError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="flex items-center justify-between">
                    <span>
                      Failed to load messages. {error instanceof Error ? error.message : 'Please try again.'}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRetry}
                      className="ml-2"
                    >
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              
              {isLoading || isActorLoading ? (
                <div className="flex min-h-[400px] items-center justify-center">
                  <div className="text-center space-y-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      {isActorLoading ? 'Connecting...' : 'Loading messages...'}
                    </p>
                  </div>
                </div>
              ) : messages.length === 0 && !showConnectionError && !isError ? (
                <div className="flex min-h-[400px] items-center justify-center">
                  <div className="text-center space-y-2">
                    <img
                      src="/assets/generated/chat-privacy-icon-transparent.dim_64x64.png"
                      alt="No messages"
                      className="h-16 w-16 mx-auto opacity-50"
                    />
                    <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
                  </div>
                </div>
              ) : !showConnectionError ? (
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <MessageBubble 
                      key={`${msg.id}-${msg.timestamp}`} 
                      message={msg} 
                      currentNickname={nickname}
                      currentUserId={userId}
                      onReply={handleReply}
                      onEdit={handleEdit}
                      onDelete={handleDeleteClick}
                      onReaction={handleReaction}
                      allMessages={messages}
                    />
                  ))}
                  <div ref={messagesEndRef} className="h-1" />
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Input Area - Fixed at bottom with safe area support */}
      <div className="flex-shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-safe">
        <div className="container max-w-5xl">
          <div className="p-4">
            {sendError && (
              <Alert variant="destructive" className="mb-3">
                <AlertDescription>{sendError}</AlertDescription>
              </Alert>
            )}

            {replyingTo && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted/50 p-2 border border-primary/20">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-primary">
                    Replying to {replyingTo.nickname}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {getMessagePreview(replyingTo)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={handleCancelReply}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {editingMessage && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-accent/50 p-2 border border-accent">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-accent-foreground">
                    Editing message
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Press Enter to save, Shift+Enter for new line, Esc to cancel
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={handleCancelEdit}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {imagePreview && (
              <div className="mb-2 relative rounded-lg border border-primary/20 p-2 bg-muted/50">
                <div className="flex items-center gap-2">
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    className="h-20 w-20 object-cover rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">Image ready to send</p>
                    {uploadProgress > 0 && uploadProgress < 100 && (
                      <div className="mt-1">
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Uploading: {uploadProgress}%
                        </p>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={handleRemoveImage}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            
            <div className="flex items-end gap-2">
              <div className="relative flex-1">
                <Textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  onFocus={handleInputFocus}
                  placeholder={
                    editingMessage 
                      ? "Edit your message... (Enter to send, Shift+Enter for new line)" 
                      : "Type a message... (Enter to send, Shift+Enter for new line)"
                  }
                  className="pr-32 min-h-[40px] max-h-[200px] resize-none"
                  rows={1}
                  disabled={sendMessage.isPending || editMessage.isPending || !actor}
                />
                <div className="absolute right-2 top-2 flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sendMessage.isPending || editMessage.isPending || !actor}
                    title="Upload image"
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setShowAudioRecorder(!showAudioRecorder);
                      setShowEmojiPicker(false);
                      setShowMediaPicker(false);
                    }}
                    disabled={sendMessage.isPending || editMessage.isPending || !actor}
                    title="Record audio"
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setShowEmojiPicker(!showEmojiPicker);
                      setShowMediaPicker(false);
                      setShowAudioRecorder(false);
                    }}
                    disabled={sendMessage.isPending || editMessage.isPending || !actor}
                  >
                    <Smile className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setShowMediaPicker(!showMediaPicker);
                      setShowEmojiPicker(false);
                      setShowAudioRecorder(false);
                    }}
                    disabled={sendMessage.isPending || editMessage.isPending || !actor}
                  >
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                </div>
                {showEmojiPicker && (
                  <div className="absolute bottom-full right-0 mb-2 z-50">
                    <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmojiPicker(false)} />
                  </div>
                )}
                {showMediaPicker && (
                  <div className="absolute bottom-full right-0 mb-2 z-50">
                    <MediaPicker onSelect={handleMediaSelect} onClose={() => setShowMediaPicker(false)} />
                  </div>
                )}
                {showAudioRecorder && (
                  <div className="absolute bottom-full right-0 mb-2 z-50">
                    <AudioRecorder onSend={handleAudioSend} onClose={() => setShowAudioRecorder(false)} />
                  </div>
                )}
              </div>
              <Button
                onClick={handleSendMessage}
                disabled={(!message.trim() && !selectedImage) || sendMessage.isPending || editMessage.isPending || !actor}
                size="icon"
                className="h-10 w-10 flex-shrink-0"
              >
                {(sendMessage.isPending || editMessage.isPending) ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground text-center">
              Messages auto-delete after {messageTTLHours} hours • Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!messageToDelete} onOpenChange={(open) => !open && handleCancelDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The message will be permanently removed from the chat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMessage.isPending ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                  Deleting...
                </div>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
