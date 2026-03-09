import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  Download,
  Edit2,
  Loader2,
  Pause,
  Play,
  Reply,
  Smile,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { MessageView, Reaction } from "../backend";
import {
  downloadImageAsPNG,
  downloadUploadedImage,
  downloadVideoAsMP4,
} from "../utils/downloadMedia";

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

const REACTION_EMOJIS = ["❤️", "😂", "👍", "😮"];

export default function MessageBubble({
  message,
  currentNickname,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  onReaction,
  onJumpToMessage,
  allMessages,
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
  const [audioLoading, setAudioLoading] = useState(false);
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const [videoDownloadProgress, setVideoDownloadProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Compare by nickname instead of owner (which was removed from backend)
  const isOwnMessage = message.nickname === currentNickname;

  // Check if message is optimistic (not yet confirmed by backend)
  const isOptimistic = (message as any).isOptimistic === true;

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const repliedToMessage =
    message.replyToId !== null && message.replyToId !== undefined
      ? allMessages.find((m) => m.id === message.replyToId)
      : null;

  const getMessagePreview = (content: string) => {
    const text =
      content.length > 50 ? `${content.substring(0, 50)}...` : content;
    return text;
  };

  const groupedReactions = message.reactions.reduce(
    (acc, reaction) => {
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
    },
    {} as Record<
      string,
      { count: number; users: string[]; hasCurrentUser: boolean }
    >,
  );

  const handleReactionClick = (emoji: string) => {
    onReaction(message.id, emoji);
    setShowReactionPicker(false);
  };

  const handleReplyPreviewClick = () => {
    if (
      message.replyToId !== null &&
      message.replyToId !== undefined &&
      onJumpToMessage
    ) {
      onJumpToMessage(message.replyToId);
    }
  };

  const handleDownloadImage = async (source: string, filename: string) => {
    try {
      const pngFilename = filename.replace(/\.[^.]+$/, ".png");
      await downloadImageAsPNG(source, pngFilename);
    } catch (error) {
      console.error("Failed to download image:", error);
      toast.error("Failed to download image. Please try again.");
    }
  };

  const handleDownloadUploadedImage = async () => {
    if (!message.image) return;

    try {
      await downloadUploadedImage(message.image, `image-${message.id}.jpg`);
      toast.success("Image downloaded successfully!");
    } catch (error) {
      console.error("Failed to download image:", error);
      toast.error("Failed to download image. Please try again.");
    }
  };

  const handleDownloadVideo = async () => {
    if (!message.video) return;

    setIsDownloadingVideo(true);
    setVideoDownloadProgress(0);

    try {
      const filename = `video-${message.id}.mp4`;
      await downloadVideoAsMP4(message.video.file, filename, (progress) =>
        setVideoDownloadProgress(progress),
      );
      toast.success("Video downloaded successfully!");
    } catch (error) {
      console.error("Failed to download video:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      toast.error(`Failed to download video: ${errorMessage}`);
    } finally {
      setIsDownloadingVideo(false);
      setVideoDownloadProgress(0);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: message.audio triggers re-attach of listeners when audio src changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      if (audio && !Number.isNaN(audio.currentTime)) {
        setAudioProgress(audio.currentTime);
      }
    };

    const handleLoadedMetadata = () => {
      if (audio && !Number.isNaN(audio.duration)) {
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
      console.error("Audio playback error:", e);
      setAudioError(true);
      setAudioLoading(false);
      setIsPlayingAudio(false);
    };

    const handleCanPlay = () => {
      setAudioLoading(false);
      setAudioError(false);
    };

    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("canplay", handleCanPlay);

    return () => {
      audio.removeEventListener("timeupdate", updateProgress);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("canplay", handleCanPlay);
    };
  }, [message.audio]);

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
      console.error("Error toggling audio playback:", error);
      setAudioError(true);
      setIsPlayingAudio(false);
    }
  };

  const handleAudioSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || audioError) return;

    try {
      const newTime = Number.parseFloat(e.target.value);
      if (!Number.isNaN(newTime)) {
        audio.currentTime = newTime;
        setAudioProgress(newTime);
      }
    } catch (error) {
      console.error("Error seeking audio:", error);
    }
  };

  const formatTime = (seconds: number) => {
    if (Number.isNaN(seconds) || !Number.isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const detectMediaUrls = (text: string): string[] => {
    const mediaUrls: string[] = [];
    const seenUrls = new Set<string>();

    const extensionRegex =
      /(https?:\/\/[^\s<>"]+\.(gif|png|jpe?g|webp)(?:[?#][^\s<>"]*)?)/gi;
    const addMatches = (regex: RegExp) => {
      let m: RegExpExecArray | null = regex.exec(text);
      while (m !== null) {
        const url = m[0];
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          mediaUrls.push(url);
        }
        m = regex.exec(text);
      }
    };

    addMatches(extensionRegex);
    addMatches(/(https?:\/\/(?:[a-z0-9-]+\.)?tenor\.com\/[^\s<>"]+)/gi);
    addMatches(/(https?:\/\/(?:[a-z0-9-]+\.)?giphy\.com\/[^\s<>"]+)/gi);
    addMatches(/(https?:\/\/(?:i\.)?imgur\.com\/[^\s<>"]+)/gi);

    return mediaUrls;
  };

  const mediaUrls = detectMediaUrls(message.content);
  const hasMedia = mediaUrls.length > 0;

  const hasUploadedImage =
    message.image !== undefined && message.image !== null;
  const hasUploadedVideo =
    message.video !== undefined && message.video !== null;
  const hasUploadedAudio =
    message.audio !== undefined && message.audio !== null;

  const renderContent = () => {
    const parts: React.ReactElement[] = [];

    if (hasUploadedImage && message.image) {
      try {
        const imageUrl = message.image.file.getDirectURL();
        parts.push(
          <div key="uploaded-image" className="relative group/image">
            <img
              src={imageUrl}
              alt="Uploaded"
              className="rounded-md max-w-full max-h-64 w-auto h-auto object-contain"
              loading="lazy"
              onError={(e) => {
                console.error("Image load error:", e);
                setImageError(true);
              }}
              onLoad={() => setImageError(false)}
            />
            {imageError && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/80 rounded-md">
                <div className="text-center p-2">
                  <AlertCircle className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Image failed to load
                  </p>
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
                    <p>Download image</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>,
        );
      } catch (error) {
        console.error("Error getting image URL:", error);
        setImageError(true);
      }
    }

    if (hasUploadedVideo && message.video) {
      try {
        const videoUrl = message.video.file.getDirectURL();
        parts.push(
          <div key="uploaded-video" className="relative group/video">
            <video
              src={videoUrl}
              controls
              className="rounded-md max-w-full max-h-96 w-auto h-auto"
              preload="metadata"
              playsInline
              onError={(e) => {
                console.error("Video load error:", e);
                setVideoError(true);
              }}
              onLoadedMetadata={() => setVideoError(false)}
            >
              <track kind="captions" />
              Your browser does not support the video tag.
            </video>
            {videoError && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/80 rounded-md">
                <div className="text-center p-2">
                  <AlertCircle className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Video failed to load
                  </p>
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
                        : "Download video"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>,
        );
      } catch (error) {
        console.error("Error getting video URL:", error);
        setVideoError(true);
      }
    }

    if (hasUploadedAudio && message.audio) {
      try {
        const audioUrl = message.audio.file.getDirectURL();
        parts.push(
          <div
            key="uploaded-audio"
            className="flex items-center gap-3 bg-muted/30 rounded-lg p-3 max-w-sm"
          >
            <audio ref={audioRef} src={audioUrl} preload="metadata" playsInline>
              <track kind="captions" />
            </audio>
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
                  disabled={audioError}
                >
                  {audioLoading && isPlayingAudio ? (
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
                    disabled={audioError}
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
          </div>,
        );
      } catch (error) {
        console.error("Error getting audio URL:", error);
        setAudioError(true);
      }
    }

    if (!hasMedia) {
      if (
        message.content &&
        !message.content.match(/^(🎬 Video|🎵 Audio|📷 Image)( message)?$/)
      ) {
        parts.push(
          <p
            key="text-content"
            className="text-sm whitespace-pre-wrap break-words"
          >
            {message.content}
          </p>,
        );
      }
      return parts.length > 0 ? parts : null;
    }

    let remainingText = message.content;
    let mediaIndex = 0;

    let urlIndex = 0;
    for (const url of mediaUrls) {
      const urlPosition = remainingText.indexOf(url);

      if (urlPosition !== -1) {
        const textBefore = remainingText.substring(0, urlPosition);
        if (textBefore.trim()) {
          parts.push(
            <p
              key={`text-${mediaIndex}`}
              className="text-sm whitespace-pre-wrap break-words"
            >
              {textBefore}
            </p>,
          );
          mediaIndex++;
        }

        parts.push(
          <div key={`media-${url}`} className="relative group/media">
            <img
              src={url}
              alt="Embedded media"
              className="rounded-md max-w-full max-h-64 w-auto h-auto object-contain cursor-pointer hover:opacity-90 transition-opacity"
              loading="lazy"
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
                      handleDownloadImage(url, `media-${urlIndex}.png`);
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
          </div>,
        );

        remainingText = remainingText.substring(urlPosition + url.length);
      }
      urlIndex++;
    }

    if (remainingText.trim()) {
      parts.push(
        <p key={"text-end"} className="text-sm whitespace-pre-wrap break-words">
          {remainingText}
        </p>,
      );
    }

    return parts.length > 0 ? parts : null;
  };

  return (
    <div
      className={`flex gap-3 ${isOwnMessage ? "flex-row-reverse" : "flex-row"}`}
    >
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarImage
          src={"/assets/generated/default-avatar.dim_64x64.png"}
          alt={message.nickname}
        />
        <AvatarFallback>{getInitials(message.nickname)}</AvatarFallback>
      </Avatar>

      <div
        className={`flex flex-col gap-1 max-w-[70%] ${isOwnMessage ? "items-end" : "items-start"}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{message.nickname}</span>
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
          {message.isEdited && (
            <Badge variant="outline" className="text-xs px-1 py-0">
              Edited
            </Badge>
          )}
          {isOptimistic && (
            <Badge variant="outline" className="text-xs px-1 py-0">
              Sending...
            </Badge>
          )}
        </div>

        {repliedToMessage && (
          <button
            type="button"
            className="text-xs bg-muted/50 rounded px-2 py-1 mb-1 cursor-pointer hover:bg-muted/70 transition-colors text-left w-full"
            onClick={handleReplyPreviewClick}
          >
            <span className="font-medium">{repliedToMessage.nickname}: </span>
            <span className="text-muted-foreground">
              {getMessagePreview(repliedToMessage.content)}
            </span>
          </button>
        )}

        <div
          className={`rounded-lg px-4 py-2 space-y-2 ${
            isOwnMessage ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
        >
          {renderContent()}
        </div>

        {Object.keys(groupedReactions).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(groupedReactions).map(([emoji, data]) => (
              <button
                type="button"
                key={emoji}
                onClick={() => handleReactionClick(emoji)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
                  data.hasCurrentUser
                    ? "bg-primary/20 border border-primary"
                    : "bg-muted hover:bg-muted/80 border border-transparent"
                }`}
              >
                <span>{emoji}</span>
                <span className="font-medium">{data.count}</span>
              </button>
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
                  className="h-6 w-6"
                  onClick={() => onReply(message)}
                >
                  <Reply className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Reply</p>
              </TooltipContent>
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
                      className="h-6 w-6"
                      onClick={() => onEdit(message)}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Edit</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => onDelete(message)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Delete</p>
                  </TooltipContent>
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
                    className="h-6 w-6"
                    onClick={() => setShowReactionPicker(!showReactionPicker)}
                  >
                    <Smile className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>React</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {showReactionPicker && (
              <div className="absolute bottom-full mb-1 left-0 bg-popover border rounded-lg shadow-lg p-2 flex gap-1 z-10">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    onClick={() => handleReactionClick(emoji)}
                    className="hover:bg-muted rounded p-1 transition-colors text-lg"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
