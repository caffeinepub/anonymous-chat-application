import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Video, X, Send, Upload, Play, Pause, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface VideoUploaderProps {
  onSend: (videoBlob: Blob) => void;
  onClose: () => void;
}

export default function VideoUploader({ onSend, onClose }: VideoUploaderProps) {
  const [selectedVideo, setSelectedVideo] = useState<Blob | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Maximum video size: 50MB
  const MAX_SIZE = 50 * 1024 * 1024;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVideoError(null);

    // Validate file type
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
    if (!validTypes.includes(file.type)) {
      setVideoError('Please select a valid video file (MP4, WebM, MOV, or AVI)');
      toast.error('Invalid video format');
      return;
    }

    // Validate file size
    if (file.size > MAX_SIZE) {
      setVideoError('Video size must be less than 50MB');
      toast.error('Video file too large');
      return;
    }

    try {
      setSelectedVideo(file);
      
      // Create preview URL using URL.createObjectURL for proper Blob handling
      const previewUrl = URL.createObjectURL(file);
      setVideoPreviewUrl(previewUrl);
      
      toast.success('Video selected! Preview and send when ready.');
    } catch (error) {
      console.error('Error processing video:', error);
      setVideoError('Failed to process video file');
      toast.error('Failed to process video');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCancel = () => {
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setSelectedVideo(null);
    setVideoPreviewUrl(null);
    setIsPlaying(false);
    setVideoError(null);
    setUploadProgress(0);
  };

  const handleSend = async () => {
    if (!selectedVideo) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Simulate upload progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);

      await onSend(selectedVideo);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      // Clean up preview URL
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
      
      toast.success('Video sent!');
      onClose();
    } catch (error) {
      console.error('Error sending video:', error);
      setVideoError('Failed to send video');
      toast.error('Failed to send video');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (isPlaying) {
        video.pause();
        setIsPlaying(false);
      } else {
        video.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error toggling video playback:', error);
      setVideoError('Failed to play video preview');
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
  };

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    console.error('Video preview error:', e);
    setVideoError('Failed to load video preview');
    toast.error('Video preview failed to load');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <Card className="w-96 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <img 
            src="/assets/generated/video-camera-icon-transparent.dim_24x24.png" 
            alt="Video" 
            className="h-5 w-5"
          />
          Video Upload
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {videoError && (
          <div className="text-center space-y-2 py-2">
            <p className="text-sm text-destructive">{videoError}</p>
          </div>
        )}

        {/* Video Preview or Upload Button */}
        <div className="flex flex-col items-center justify-center space-y-3">
          {videoPreviewUrl ? (
            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                src={videoPreviewUrl}
                className="w-full h-full object-contain"
                onEnded={handleVideoEnded}
                onError={handleVideoError}
                controls={false}
                playsInline
              />
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Button
                    onClick={togglePlayback}
                    size="icon"
                    className="h-16 w-16 rounded-full"
                    variant="secondary"
                  >
                    <Play className="h-8 w-8" />
                  </Button>
                </div>
              )}
              {isPlaying && (
                <div className="absolute bottom-4 right-4">
                  <Button
                    onClick={togglePlayback}
                    size="icon"
                    className="h-10 w-10 rounded-full"
                    variant="secondary"
                  >
                    <Pause className="h-5 w-5" />
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full aspect-video bg-muted rounded-lg flex flex-col items-center justify-center space-y-3 border-2 border-dashed border-muted-foreground/25">
              <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
                <Video className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">No video selected</p>
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Choose Video
              </Button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
            onChange={handleFileSelect}
            className="hidden"
          />

          {selectedVideo && (
            <div className="w-full text-center space-y-1">
              <p className="text-xs text-muted-foreground">
                Size: {formatFileSize(selectedVideo.size)} / {formatFileSize(MAX_SIZE)}
              </p>
              {isUploading && uploadProgress > 0 && (
                <div className="space-y-1">
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Uploading: {uploadProgress}%
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-2">
          {!selectedVideo ? (
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="gap-2 w-full"
            >
              <Upload className="h-4 w-4" />
              Select Video File
            </Button>
          ) : (
            <>
              <Button
                onClick={handleCancel}
                variant="outline"
                disabled={isUploading}
                className="flex-1"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={isUploading || !!videoError}
                className="flex-1 gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send
                  </>
                )}
              </Button>
            </>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Supported formats: MP4, WebM, MOV, AVI (Max: 50MB)
        </p>
      </CardContent>
    </Card>
  );
}
