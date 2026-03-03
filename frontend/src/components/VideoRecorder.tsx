import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Video, Square, Play, X, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface VideoRecorderProps {
  onSend: (videoBlob: Blob) => void;
  onClose: () => void;
}

export default function VideoRecorder({ onSend, onClose }: VideoRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Maximum recording duration: 2 minutes
  const MAX_DURATION = 2 * 60;

  useEffect(() => {
    return () => {
      stopRecording();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
    };
  }, [recordedUrl]);

  const startRecording = async () => {
    setIsInitializing(true);
    setPermissionDenied(false);
    setPreviewError(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: true
      });

      streamRef.current = stream;

      // Show live preview
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play();
      }

      // Determine supported MIME type
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ];

      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      if (!selectedMimeType) {
        throw new Error('No supported video format found');
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
      });

      videoChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          videoChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(videoChunksRef.current, { type: selectedMimeType });
        setRecordedBlob(blob);
        
        // Create preview URL using URL.createObjectURL
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        
        // Stop live preview
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingTime(0);

      // Start recording timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const newTime = prev + 1;
          if (newTime >= MAX_DURATION) {
            stopRecording();
            toast.info('Maximum recording duration reached');
          }
          return newTime;
        });
      }, 1000);

      toast.success('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      if (error instanceof Error && error.name === 'NotAllowedError') {
        setPermissionDenied(true);
        toast.error('Camera/microphone permission denied');
      } else {
        toast.error('Failed to start recording');
      }
    } finally {
      setIsInitializing(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const handleSend = () => {
    if (recordedBlob) {
      onSend(recordedBlob);
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
      onClose();
    }
  };

  const handleCancel = () => {
    if (isRecording) {
      stopRecording();
    }
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordingTime(0);
  };

  const handlePreviewError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    console.error('Video preview error:', e);
    setPreviewError(true);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="w-full max-w-2xl shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <img 
            src="/assets/generated/video-camera-icon-transparent.dim_24x24.png" 
            alt="Video" 
            className="h-5 w-5"
          />
          Video Recording
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {permissionDenied ? (
          <div className="text-center space-y-3 py-4">
            <p className="text-sm text-destructive">Camera/microphone permission denied</p>
            <p className="text-xs text-muted-foreground">
              Please allow camera and microphone access in your browser settings
            </p>
          </div>
        ) : (
          <>
            {/* Video Preview */}
            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                playsInline
                muted={isRecording}
                controls={!isRecording && recordedUrl !== null}
                src={recordedUrl || undefined}
                onError={handlePreviewError}
              />
              {previewError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <p className="text-sm text-white">Failed to load video preview</p>
                </div>
              )}
              {isRecording && (
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-destructive/90 text-destructive-foreground px-3 py-1.5 rounded-full">
                  <div className="h-3 w-3 rounded-full bg-white animate-pulse" />
                  <span className="text-sm font-mono font-bold">{formatTime(recordingTime)}</span>
                </div>
              )}
            </div>

            {/* Recording Info */}
            {isRecording && (
              <p className="text-xs text-muted-foreground text-center">
                Maximum duration: {formatTime(MAX_DURATION)}
              </p>
            )}

            {/* Controls */}
            <div className="flex items-center justify-center gap-2">
              {!recordedBlob ? (
                <>
                  {!isRecording ? (
                    <Button
                      onClick={startRecording}
                      disabled={isInitializing}
                      className="gap-2"
                    >
                      {isInitializing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Initializing...
                        </>
                      ) : (
                        <>
                          <Video className="h-4 w-4" />
                          Start Recording
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={stopRecording}
                      variant="destructive"
                      className="gap-2"
                    >
                      <Square className="h-4 w-4" />
                      Stop Recording
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button
                    onClick={handleCancel}
                    variant="outline"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSend}
                    className="gap-2"
                  >
                    <Send className="h-4 w-4" />
                    Send Video
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
