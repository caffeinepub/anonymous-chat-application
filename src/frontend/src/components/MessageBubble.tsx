import { formatDistanceToNow } from 'date-fns';
import type { MessageView, Reaction } from '../backend';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Reply, Edit2, Trash2, Smile, Play, Pause, AlertCircle } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface MessageBubbleProps {
  message: MessageView;
  currentNickname: string;
  currentUserId: string;
  onReply: (message: MessageView) => void;
  onEdit: (message: MessageView) => void;
  onDelete: (message: MessageView) => void;
  onReaction: (messageId: bigint, emoji: string) => void;
  onJumpToMessage?: (messageId: bigint) => void;
  allMessages: MessageView[];
}

const REACTION_EMOJIS = ['❤️', '😂', '👍', '😮'];

export default function MessageBubble({ 
  message, 
  currentNickname, 
  currentUserId,
  onReply, 
  onEdit, 
  onDelete, 
  onReaction,
  onJumpToMessage,
  allMessages 
}: MessageBubbleProps) {
  const timestamp = new Date(Number(message.timestamp) / 1_000_000);
  const timeAgo = formatDistanceToNow(timestamp, { addSuffix: true });
  const [imageError, setImageError] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [audioLoading, setAudioLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isOwnMessage = message.nickname === currentNickname;

  // Get initials from nickname for avatar fallback
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Find the message being replied to
  const repliedToMessage = message.replyToId 
    ? allMessages.find(m => m.id === message.replyToId)
    : null;

  // Get message preview text (first 50 chars)
  const getMessagePreview = (content: string) => {
    const text = content.length > 50 ? content.substring(0, 50) + '...' : content;
    return text;
  };

  // Group reactions by emoji and count
  const groupedReactions = message.reactions.reduce((acc, reaction) => {
    if (!acc[reaction.emoji]) {
      acc[reaction.emoji] = {
        count: 0,
        users: [],
        hasCurrentUser: false,
      };
    }
    acc[reaction.emoji].count++;
    acc[reaction.emoji].users.push(reaction.userId);
    if (reaction.userId === currentUserId) {
      acc[reaction.emoji].hasCurrentUser = true;
    }
    return acc;
  }, {} as Record<string, { count: number; users: string[]; hasCurrentUser: boolean }>);

  // Handle reaction click
  const handleReactionClick = (emoji: string) => {
    onReaction(message.id, emoji);
    setShowReactionPicker(false);
  };

  // Handle reply preview click
  const handleReplyPreviewClick = () => {
    if (message.replyToId && onJumpToMessage) {
      onJumpToMessage(message.replyToId);
    }
  };

  // Audio playback controls with enhanced error handling
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      if (audio && !isNaN(audio.currentTime)) {
        setAudioProgress(audio.currentTime);
      }
    };

    const handleLoadedMetadata = () => {
      if (audio && !isNaN(audio.duration)) {
        setAudioDuration(audio.duration);
        setAudioLoading(false);
        setAudioError(false);
      }
    };

    const handleEnded = () => {
      setIsPlayingAudio(false);
      setAudioProgress(0);
    };

    const handleError = (e: Event) => {
      console.error('Audio playback error:', e);
      setAudioError(true);
      setAudioLoading(false);
      setIsPlayingAudio(false);
    };

    const handleCanPlay = () => {
      setAudioLoading(false);
      setAudioError(false);
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [message.audioUrl]);

  const toggleAudioPlayback = async () => {
    const audio = audioRef.current;
    if (!audio || audioError) return;

    try {
      if (isPlayingAudio) {
        audio.pause();
        setIsPlayingAudio(false);
      } else {
        await audio.play();
        setIsPlayingAudio(true);
      }
    } catch (error) {
      console.error('Error toggling audio playback:', error);
      setAudioError(true);
      setIsPlayingAudio(false);
    }
  };

  const handleAudioSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || audioError) return;

    try {
      const newTime = parseFloat(e.target.value);
      if (!isNaN(newTime)) {
        audio.currentTime = newTime;
        setAudioProgress(newTime);
      }
    } catch (error) {
      console.error('Error seeking audio:', error);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Enhanced URL detection for images and GIFs
  const detectMediaUrls = (text: string): string[] => {
    const mediaUrls: string[] = [];
    const seenUrls = new Set<string>();
    
    // Pattern 1: Direct file URLs with extensions (including query params and fragments)
    const extensionRegex = /(https?:\/\/[^\s<>"]+\.(gif|png|jpe?g|webp)(?:[?#][^\s<>"]*)?)/gi;
    let match;
    
    while ((match = extensionRegex.exec(text)) !== null) {
      const url = match[0];
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        mediaUrls.push(url);
      }
    }
    
    // Pattern 2: Tenor URLs (all formats)
    const tenorRegex = /(https?:\/\/(?:[a-z0-9-]+\.)?tenor\.com\/[^\s<>"]+)/gi;
    while ((match = tenorRegex.exec(text)) !== null) {
      const url = match[0];
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        mediaUrls.push(url);
      }
    }
    
    // Pattern 3: Giphy URLs (all formats)
    const giphyRegex = /(https?:\/\/(?:[a-z0-9-]+\.)?giphy\.com\/[^\s<>"]+)/gi;
    while ((match = giphyRegex.exec(text)) !== null) {
      const url = match[0];
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        mediaUrls.push(url);
      }
    }
    
    // Pattern 4: Imgur URLs
    const imgurRegex = /(https?:\/\/(?:i\.)?imgur\.com\/[^\s<>"]+)/gi;
    while ((match = imgurRegex.exec(text)) !== null) {
      const url = match[0];
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        mediaUrls.push(url);
      }
    }
    
    return mediaUrls;
  };

  const mediaUrls = detectMediaUrls(message.content);
  const hasMedia = mediaUrls.length > 0;

  // Check if message has uploaded media
  const hasUploadedImage = message.imageUrl !== undefined && message.imageUrl !== null;
  const hasUploadedVideo = message.videoUrl !== undefined && message.videoUrl !== null;
  const hasUploadedAudio = message.audioUrl !== undefined && message.audioUrl !== null;

  // Split content into text and media parts
  const renderContent = () => {
    const parts: React.ReactElement[] = [];

    // Render uploaded image first if present
    if (hasUploadedImage && message.imageUrl) {
      try {
        const imageUrl = message.imageUrl.getDirectURL();
        parts.push(
          <div key="uploaded-image" className="relative">
            <img
              src={imageUrl}
              alt="Uploaded image"
              className="rounded-md max-w-full max-h-64 w-auto h-auto object-contain"
              loading="lazy"
              onError={(e) => {
                console.error('Image load error:', e);
                setImageError(true);
              }}
              onLoad={() => setImageError(false)}
            />
            {imageError && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/80 rounded-md">
                <div className="text-center p-2">
                  <AlertCircle className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Image failed to load</p>
                </div>
              </div>
            )}
          </div>
        );
      } catch (error) {
        console.error('Error getting image URL:', error);
        setImageError(true);
      }
    }

    // Render uploaded video if present
    if (hasUploadedVideo && message.videoUrl) {
      try {
        const videoUrl = message.videoUrl.getDirectURL();
        parts.push(
          <div key="uploaded-video" className="relative">
            <video
              src={videoUrl}
              controls
              className="rounded-md max-w-full max-h-96 w-auto h-auto"
              preload="metadata"
              playsInline
              onError={(e) => {
                console.error('Video load error:', e);
                setVideoError(true);
              }}
              onLoadedMetadata={() => setVideoError(false)}
            >
              Your browser does not support the video tag.
            </video>
            {videoError && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/80 rounded-md">
                <div className="text-center p-2">
                  <AlertCircle className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Video failed to load</p>
                </div>
              </div>
            )}
          </div>
        );
      } catch (error) {
        console.error('Error getting video URL:', error);
        setVideoError(true);
      }
    }

    // Render uploaded audio if present
    if (hasUploadedAudio && message.audioUrl) {
      try {
        const audioUrl = message.audioUrl.getDirectURL();
        parts.push(
          <div key="uploaded-audio" className="flex items-center gap-3 bg-muted/30 rounded-lg p-3 max-w-sm">
            <audio 
              ref={audioRef} 
              src={audioUrl} 
              preload="metadata"
              crossOrigin="anonymous"
            />
            {audioError ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertCircle className="h-5 w-5" />
                <span className="text-xs">Audio unavailable</span>
              </div>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 flex-shrink-0"
                  onClick={toggleAudioPlayback}
                  disabled={audioLoading || audioError}
                >
                  {audioLoading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  ) : isPlayingAudio ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5" />
                  )}
                </Button>
                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    type="range"
                    min="0"
                    max={audioDuration || 0}
                    value={audioProgress}
                    onChange={handleAudioSeek}
                    disabled={audioLoading || audioError}
                    className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatTime(audioProgress)}</span>
                    <span>{formatTime(audioDuration)}</span>
                  </div>
                </div>
                <img 
                  src="/assets/generated/audio-waveform-icon-transparent.dim_32x32.png" 
                  alt="Audio" 
                  className="h-6 w-6 opacity-50"
                />
              </>
            )}
          </div>
        );
      } catch (error) {
        console.error('Error getting audio URL:', error);
        setAudioError(true);
      }
    }

    // Render text and embedded media
    if (!hasMedia) {
      if (message.content && !message.content.match(/^(🎬 Video|🎵 Audio|📷 Image)( message)?$/)) {
        parts.push(
          <p key="text-content" className="text-sm whitespace-pre-wrap break-words">
            {message.content}
          </p>
        );
      }
      return parts.length > 0 ? parts : null;
    }

    // Split content by media URLs and render text + media
    let remainingText = message.content;
    let mediaIndex = 0;

    mediaUrls.forEach((url, index) => {
      const urlPosition = remainingText.indexOf(url);
      
      if (urlPosition !== -1) {
        // Add text before the URL
        const textBefore = remainingText.substring(0, urlPosition);
        if (textBefore.trim()) {
          parts.push(
            <p key={`text-${mediaIndex}`} className="text-sm whitespace-pre-wrap break-words">
              {textBefore}
            </p>
          );
          mediaIndex++;
        }

        // Add the media with error handling
        parts.push(
          <div key={`media-${index}`} className="relative">
            <img
              src={url}
              alt="Shared media"
              className="rounded-md max-w-full max-h-64 w-auto h-auto object-contain"
              loading="lazy"
              onError={(e) => {
                console.error('Embedded media load error:', e);
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
          </div>
        );

        // Update remaining text
        remainingText = remainingText.substring(urlPosition + url.length);
      }
    });

    // Add remaining text after the last URL
    if (remainingText.trim()) {
      parts.push(
        <p key={`text-${mediaIndex}`} className="text-sm whitespace-pre-wrap break-words">
          {remainingText}
        </p>
      );
    }

    return parts.length > 0 ? parts : null;
  };

  return (
    <div 
      id={`message-${message.id}`}
      data-message-id={message.id.toString()}
      className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 group"
    >
      <Avatar className="h-10 w-10 border-2 border-primary/20">
        <AvatarImage src="/assets/generated/anonymous-avatar-transparent.dim_100x100.png" />
        <AvatarFallback>{getInitials(message.nickname)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{message.nickname}</span>
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
          {message.isEdited && (
            <Badge variant="secondary" className="text-xs">
              Edited
            </Badge>
          )}
        </div>
        <div className="rounded-lg bg-muted/50 p-3 max-w-2xl">
          {/* Reply Preview - Clickable */}
          {message.replyToId && (
            <button
              onClick={handleReplyPreviewClick}
              className="mb-2 pl-2 border-l-2 border-primary/40 bg-background/50 rounded p-2 w-full text-left hover:bg-background/70 transition-colors cursor-pointer"
            >
              <p className="text-xs font-semibold text-primary">
                Replying to {repliedToMessage?.nickname || 'Unknown'}
              </p>
              <p className="text-xs text-muted-foreground">
                {repliedToMessage ? getMessagePreview(repliedToMessage.content) : 'Message not available'}
              </p>
            </button>
          )}
          
          <div className="space-y-2">
            {renderContent()}
          </div>
        </div>
        
        {/* Reactions Display */}
        {Object.keys(groupedReactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {Object.entries(groupedReactions).map(([emoji, data]) => (
              <TooltipProvider key={emoji}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={data.hasCurrentUser ? "default" : "outline"}
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => handleReactionClick(emoji)}
                    >
                      <span>{emoji}</span>
                      <span className="font-semibold">{data.count}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      {data.users.length === 1 
                        ? '1 person reacted' 
                        : `${data.users.length} people reacted`}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onReply(message)}
          >
            <Reply className="h-3 w-3 mr-1" />
            Reply
          </Button>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowReactionPicker(!showReactionPicker)}
            >
              <Smile className="h-3 w-3 mr-1" />
              React
            </Button>
            {showReactionPicker && (
              <div className="absolute bottom-full left-0 mb-1 bg-popover border rounded-lg shadow-lg p-2 flex gap-1 z-50">
                {REACTION_EMOJIS.map((emoji) => (
                  <Button
                    key={emoji}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-lg hover:scale-125 transition-transform"
                    onClick={() => handleReactionClick(emoji)}
                  >
                    {emoji}
                  </Button>
                ))}
              </div>
            )}
          </div>
          {isOwnMessage && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onEdit(message)}
              >
                <Edit2 className="h-3 w-3 mr-1" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                onClick={() => onDelete(message)}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
