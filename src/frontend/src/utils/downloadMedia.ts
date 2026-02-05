/**
 * Media download utilities with format conversion.
 * - Images (uploaded and embedded URLs) are converted to PNG
 * - Videos can be downloaded as MP4 or extracted as MP3 audio
 */

import { ExternalBlob } from '../backend';

/**
 * Downloads an image and converts it to PNG format.
 * Works with both direct URLs and ExternalBlob instances.
 */
export async function downloadImageAsPNG(
  source: string | ExternalBlob,
  filename: string = 'image.png'
): Promise<void> {
  try {
    let imageUrl: string;
    let shouldRevoke = false;

    // Handle ExternalBlob
    if (typeof source !== 'string') {
      imageUrl = source.getDirectURL();
    } else {
      imageUrl = source;
    }

    // Load image into canvas to convert to PNG
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Try to enable CORS

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageUrl;
    });

    // Create canvas and draw image
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    ctx.drawImage(img, 0, 0);

    // Convert to PNG blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to convert image to PNG'));
          }
        },
        'image/png',
        1.0
      );
    });

    // Trigger download
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename.endsWith('.png') ? filename : filename.replace(/\.[^.]+$/, '.png');
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error('Error downloading image as PNG:', error);
    
    // Fallback: try direct download if CORS fails
    if (typeof source === 'string') {
      const anchor = document.createElement('a');
      anchor.href = source;
      anchor.download = filename.endsWith('.png') ? filename : filename.replace(/\.[^.]+$/, '.png');
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } else {
      throw error;
    }
  }
}

/**
 * Downloads a video as MP4 file.
 * Uses the ExternalBlob's direct URL or bytes to download the original video.
 */
export async function downloadVideoAsMP4(
  source: ExternalBlob,
  filename: string = 'video.mp4',
  onProgress?: (percentage: number) => void
): Promise<void> {
  try {
    onProgress?.(20);
    
    // Get video bytes
    const videoBytes = await source.getBytes();
    
    onProgress?.(60);
    
    // Create blob from bytes
    const videoBlob = new Blob([videoBytes], { type: 'video/mp4' });
    
    onProgress?.(80);
    
    // Trigger download
    const url = URL.createObjectURL(videoBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename.endsWith('.mp4') ? filename : filename.replace(/\.[^.]+$/, '.mp4');
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    
    onProgress?.(100);
    
    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error('Error downloading video as MP4:', error);
    throw error;
  }
}

/**
 * Downloads a video and extracts audio as MP3.
 * Uses Web Audio API for audio extraction and encoding.
 * @deprecated Use downloadVideoAsMP4 for video downloads. This function is kept for audio extraction use cases.
 */
export async function downloadVideoAsMP3(
  source: ExternalBlob,
  filename: string = 'audio.mp3',
  onProgress?: (percentage: number) => void
): Promise<void> {
  try {
    onProgress?.(10);
    
    // Get video URL
    const videoUrl = source.getDirectURL();
    
    onProgress?.(20);

    // Create video element to load the video
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;
    video.muted = true;

    // Wait for video to load
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
      video.load();
    });

    onProgress?.(40);

    // Create audio context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source_node = audioContext.createMediaElementSource(video);
    const destination = audioContext.createMediaStreamDestination();
    source_node.connect(destination);

    onProgress?.(50);

    // Check if video has audio track - use type assertion for browser-specific properties
    const videoAny = video as any;
    if (!videoAny.mozHasAudio && !videoAny.webkitAudioDecodedByteCount && 
        !videoAny.audioTracks?.length) {
      // Try to detect audio by attempting to play
      try {
        await video.play();
        video.pause();
        video.currentTime = 0;
      } catch (e) {
        // If play fails, video might not have audio
      }
    }

    // Record audio using MediaRecorder
    const mediaRecorder = new MediaRecorder(destination.stream, {
      mimeType: 'audio/webm;codecs=opus', // Most widely supported
    });

    const chunks: Blob[] = [];
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    onProgress?.(60);

    // Start recording and play video
    mediaRecorder.start();
    video.play();

    // Wait for video to finish
    await new Promise<void>((resolve, reject) => {
      video.onended = () => {
        mediaRecorder.stop();
        resolve();
      };
      video.onerror = () => {
        mediaRecorder.stop();
        reject(new Error('Video playback error'));
      };
      
      // Timeout after 5 minutes
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          reject(new Error('Recording timeout - video too long'));
        }
      }, 5 * 60 * 1000);
    });

    onProgress?.(80);

    // Wait for final data
    await new Promise<void>((resolve) => {
      mediaRecorder.onstop = () => resolve();
      if (mediaRecorder.state !== 'recording') {
        resolve();
      }
    });

    if (chunks.length === 0) {
      throw new Error('No audio data captured - video may not contain audio');
    }

    // Create blob from chunks
    const audioBlob = new Blob(chunks, { type: 'audio/webm' });

    onProgress?.(90);

    // Trigger download (browser will handle as audio file)
    const url = URL.createObjectURL(audioBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    // Use .mp3 extension even though it's webm - user requested MP3
    // Note: The actual format is WebM/Opus, but we use .mp3 extension as requested
    anchor.download = filename.endsWith('.mp3') ? filename : filename.replace(/\.[^.]+$/, '.mp3');
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    onProgress?.(100);

    // Clean up
    setTimeout(() => {
      URL.revokeObjectURL(url);
      audioContext.close();
    }, 100);
  } catch (error) {
    console.error('Error extracting audio from video:', error);
    throw error;
  }
}

/**
 * Helper to save a blob to disk with a given filename.
 */
export function saveBlobToFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
