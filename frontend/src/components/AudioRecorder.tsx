import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, Square, Play, Pause, X, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface AudioRecorderProps {
  onSend: (audioBlob: Blob) => void;
  onClose: () => void;
}

export default function AudioRecorder({ onSend, onClose }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [previewTime, setPreviewTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Maximum recording duration: 5 minutes
  const MAX_DURATION = 5 * 60;

  useEffect(() => {
    return () => {
      stopRecording();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (previewTimerRef.current) clearInterval(previewTimerRef.current);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const startRecording = async () => {
    setIsInitializing(true);
    setPermissionDenied(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });

      // Determine supported MIME type
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ];

      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      if (!selectedMimeType) {
        throw new Error('No supported audio format found');
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: selectedMimeType });
        setRecordedBlob(blob);
        setDuration(recordingTime);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
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
        toast.error('Microphone permission denied');
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

  const playPreview = () => {
    if (!recordedBlob) return;

    if (previewAudioRef.current) {
      previewAudioRef.current.play();
      setIsPreviewing(true);
      
      // Start preview timer
      previewTimerRef.current = setInterval(() => {
        if (previewAudioRef.current) {
          setPreviewTime(Math.floor(previewAudioRef.current.currentTime));
        }
      }, 100);
    } else {
      const audio = new Audio(URL.createObjectURL(recordedBlob));
      audio.onended = () => {
        setIsPreviewing(false);
        setPreviewTime(0);
        if (previewTimerRef.current) {
          clearInterval(previewTimerRef.current);
          previewTimerRef.current = null;
        }
      };
      audio.play();
      previewAudioRef.current = audio;
      setIsPreviewing(true);
      
      // Start preview timer
      previewTimerRef.current = setInterval(() => {
        if (previewAudioRef.current) {
          setPreviewTime(Math.floor(previewAudioRef.current.currentTime));
        }
      }, 100);
    }
  };

  const pausePreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      setIsPreviewing(false);
      
      if (previewTimerRef.current) {
        clearInterval(previewTimerRef.current);
        previewTimerRef.current = null;
      }
    }
  };

  const handleSend = () => {
    if (recordedBlob) {
      onSend(recordedBlob);
      onClose();
    }
  };

  const handleCancel = () => {
    if (isRecording) {
      stopRecording();
    }
    setRecordedBlob(null);
    setRecordingTime(0);
    setPreviewTime(0);
    setDuration(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="w-80 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <img 
            src="/assets/generated/microphone-icon-transparent.dim_24x24.png" 
            alt="Microphone" 
            className="h-5 w-5"
          />
          Audio Recording
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {permissionDenied ? (
          <div className="text-center space-y-3 py-4">
            <p className="text-sm text-destructive">Microphone permission denied</p>
            <p className="text-xs text-muted-foreground">
              Please allow microphone access in your browser settings
            </p>
          </div>
        ) : (
          <>
            {/* Recording/Preview Display */}
            <div className="flex flex-col items-center justify-center space-y-3 py-6">
              {isRecording ? (
                <>
                  <div className="relative">
                    <div className="h-20 w-20 rounded-full bg-destructive/20 flex items-center justify-center animate-pulse">
                      <Mic className="h-10 w-10 text-destructive" />
                    </div>
                    <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive animate-pulse" />
                  </div>
                  <p className="text-2xl font-mono font-bold">{formatTime(recordingTime)}</p>
                  <p className="text-xs text-muted-foreground">Recording... (Max: {formatTime(MAX_DURATION)})</p>
                </>
              ) : recordedBlob ? (
                <>
                  <div className="h-20 w-20 rounded-full bg-primary/20 flex items-center justify-center">
                    <img 
                      src="/assets/generated/audio-waveform-icon-transparent.dim_32x32.png" 
                      alt="Audio" 
                      className="h-12 w-12"
                    />
                  </div>
                  <p className="text-2xl font-mono font-bold">
                    {formatTime(isPreviewing ? previewTime : duration)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isPreviewing ? 'Playing...' : 'Ready to send'}
                  </p>
                </>
              ) : (
                <>
                  <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                    <Mic className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">Click record to start</p>
                </>
              )}
            </div>

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
                          <Mic className="h-4 w-4" />
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
                      Stop
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button
                    onClick={handleCancel}
                    variant="outline"
                    size="icon"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={isPreviewing ? pausePreview : playPreview}
                    variant="outline"
                    size="icon"
                  >
                    {isPreviewing ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    onClick={handleSend}
                    className="gap-2"
                  >
                    <Send className="h-4 w-4" />
                    Send
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
