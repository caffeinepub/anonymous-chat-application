import { formatDistanceToNow } from 'date-fns';
import type { MessageView, Reaction } from '../backend';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Reply, Edit2, Trash2, Smile, Play, Pause, AlertCircle, Download, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { downloadImageAsPNG, downloadVideoAsMP4 } from '../utils/downloadMedia';
import { toast } from 'sonner';

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
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const [videoDownloadProgress, setVideoDownloadProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isOwnMessage = message.owner === currentUserId;
  
  // Check if message is optimistic (not yet confirmed by backend)
  const isOptimistic = (message as any).isOptimistic === true;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const repliedToMessage = message.replyToId !== null && message.replyToId !== undefined
    ? allMessages.find(m => m.id === message.replyToId)
    : null;

  const getMessagePreview = (content: string) => {
    const text = content.length > 50 ? content.substring(0, 50) + '...' : content;
    return text;
  };

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

  const handleReactionClick = (emoji: string) => {
    onReaction(message.id, emoji);
    setShowReactionPicker(false);
  };

  const handleReplyPreviewClick = () => {
    if (message.replyToId !== null && message.replyToId !== undefined && onJumpToMessage) {
      onJumpToMessage(message.replyToId);
    }
  };

  const handleDownloadImage = async (source: string, filename: string) => {
    try {
      const pngFilename = filename.replace(/\.[^.]+$/, '.png');
      await downloadImageAsPNG(source, pngFilename);
    } catch (error) {
      console.error('Failed to download image:', error);
      toast.error('Failed to download image. Please try again.');
    }
  };

  const handleDownloadUploadedImage = async () => {
    if (!message.imageUrl) return;
    
    try {
      const filename = `image-${message.id}.png`;
      await downloadImageAsPNG(message.imageUrl, filename);
    } catch (error) {
      console.error('Failed to download image:', error);
      toast.error('Failed to download image. Please try again.');
    }
  };

  const handleDownloadVideo = async () => {
    if (!message.videoUrl) return;
    
    setIsDownloadingVideo(true);
    setVideoDownloadProgress(0);
    
    try {
      const filename = `video-${message.id}.mp4`;
      await downloadVideoAsMP4(
        message.videoUrl, 
        filename,
        (progress) => setVideoDownloadProgress(progress)
      );
      toast.success('Video downloaded successfully!');
    } catch (error) {
      console.error('Failed to download video:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Failed to download video: ${errorMessage}`);
    } finally {
      setIsDownloadingVideo(false);
      setVideoDownloadProgress(0);
    }
  };

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

  const detectMediaUrls = (text: string): string[] => {
    const mediaUrls: string[] = [];
    const seenUrls = new Set<string>();
    
    const extensionRegex = /(https?:\/\/[^\s<>"]+\.(gif|png|jpe?g|webp)(?:[?#][^\s<>"]*)?)/gi;
    let match;
    
    while ((match = extensionRegex.exec(text)) !== null) {
      const url = match[0];
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        mediaUrls.push(url);
      }
    }
    
    const tenorRegex = /(https?:\/\/(?:[a-z0-9-]+\.)?tenor\.com\/[^\s<>"]+)/gi;
    while ((match = tenorRegex.exec(text)) !== null) {
      const url = match[0];
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        mediaUrls.push(url);
      }
    }
    
    const giphyRegex = /(https?:\/\/(?:[a-z0-9-]+\.)?giphy\.com\/[^\s<>"]+)/gi;
    while ((match = giphyRegex.exec(text)) !== null) {
      const url = match[0];
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        mediaUrls.push(url);
      }
    }
    
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

  const hasUploadedImage = message.imageUrl !== undefined && message.imageUrl !== null;
  const hasUploadedVideo = message.videoUrl !== undefined && message.videoUrl !== null;
  const hasUploadedAudio = message.audioUrl !== undefined && message.audioUrl !== null;

  const renderContent = () => {
    const parts: React.ReactElement[] = [];

    if (hasUploadedImage && message.imageUrl) {
      try {
        const imageUrl = message.imageUrl.getDirectURL();
        parts.push(
          <div key="uploaded-image" className="relative group/image">
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
            {!imageError && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover/image:opacity-100 transition-opacity shadow-lg"
                      onClick={handleDownloadUploadedImage}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Download as PNG</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        );
      } catch (error) {
        console.error('Error getting image URL:', error);
        setImageError(true);
      }
    }

    if (hasUploadedVideo && message.videoUrl) {
      try {
        const videoUrl = message.videoUrl.getDirectURL();
        parts.push(
          <div key="uploaded-video" className="relative group/video">
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
            {!videoError && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover/video:opacity-100 transition-opacity shadow-lg"
                      onClick={handleDownloadVideo}
                      disabled={isDownloadingVideo}
                    >
                      {isDownloadingVideo ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {isDownloadingVideo 
                        ? `Downloading... ${videoDownloadProgress}%` 
                        : 'Download video as MP4'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        );
      } catch (error) {
        console.error('Error getting video URL:', error);
        setVideoError(true);
      }
    }

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
                  className="h-10 w-10 shrink-0"
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

    let remainingText = message.content;
    let mediaIndex = 0;

    mediaUrls.forEach((url, index) => {
      const urlPosition = remainingText.indexOf(url);
      
      if (urlPosition !== -1) {
        const textBefore = remainingText.substring(0, urlPosition);
        if (textBefore.trim()) {
          parts.push(
            <p key={`text-${mediaIndex}`} className="text-sm whitespace-pre-wrap break-words">
              {textBefore}
            </p>
          );
          mediaIndex++;
        }

        parts.push(
          <div key={`media-${index}`} className="relative group/media">
            <img
              src={url}
              alt="Embedded media"
              className="rounded-md max-w-full max-h-64 w-auto h-auto object-contain cursor-pointer hover:opacity-90 transition-opacity"
              loading="lazy"
              onClick={() => window.open(url, '_blank')}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover/media:opacity-100 transition-opacity shadow-lg"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadImage(url, `media-${index}.png`);
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Download as PNG</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );

        remainingText = remainingText.substring(urlPosition + url.length);
      }
    });

    if (remainingText.trim()) {
      parts.push(
        <p key={`text-end`} className="text-sm whitespace-pre-wrap break-words">
          {remainingText}
        </p>
      );
    }

    return parts.length > 0 ? parts : null;
  };

  return (
    <div className={`flex gap-3 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}>
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${message.nickname}`} />
        <AvatarFallback>{getInitials(message.nickname)}</AvatarFallback>
      </Avatar>

      <div className={`flex-1 max-w-[70%] space-y-1 ${isOwnMessage ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{message.nickname}</span>
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
          {message.isEdited && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              edited
            </Badge>
          )}
          {isOptimistic && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 opacity-50">
              sending...
            </Badge>
          )}
        </div>

        {repliedToMessage && (
          <div 
            className="text-xs bg-muted/50 rounded p-2 mb-1 border-l-2 border-primary cursor-pointer hover:bg-muted/70 transition-colors"
            onClick={handleReplyPreviewClick}
          >
            <span className="font-semibold">{repliedToMessage.nickname}</span>
            <p className="text-muted-foreground truncate">{getMessagePreview(repliedToMessage.content)}</p>
          </div>
        )}

        <div className={`rounded-lg p-3 space-y-2 ${
          isOwnMessage 
            ? 'bg-primary text-primary-foreground' 
            : 'bg-muted'
        }`}>
          {renderContent()}
        </div>

        {message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(groupedReactions).map(([emoji, data]) => (
              <Button
                key={emoji}
                variant={data.hasCurrentUser ? "default" : "outline"}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => handleReactionClick(emoji)}
              >
                {emoji} {data.count}
              </Button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onReply(message)}
                >
                  <Reply className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Reply</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {isOwnMessage && !isOptimistic && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onEdit(message)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Edit</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => onDelete(message)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Delete</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}

          <div className="relative">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setShowReactionPicker(!showReactionPicker)}
                  >
                    <Smile className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>React</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {showReactionPicker && (
              <div className="absolute bottom-full mb-2 left-0 bg-popover border rounded-lg shadow-lg p-2 flex gap-1 z-10">
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
        </div>
      </div>
    </div>
  );
}
