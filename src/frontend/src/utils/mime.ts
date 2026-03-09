/**
 * MIME type utilities for media file handling.
 * Provides validation and extension mapping for image types.
 */

/**
 * Common image MIME types
 */
export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
] as const;

/**
 * Check if a MIME type is a valid image type
 */
export function isImageMimeType(mimeType: string): boolean {
  return (
    IMAGE_MIME_TYPES.includes(mimeType as any) || mimeType.startsWith("image/")
  );
}

/**
 * Get file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-msvideo": "avi",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
  };

  return mimeToExt[mimeType.toLowerCase()] || "bin";
}

/**
 * Get MIME type from file extension
 */
export function getMimeTypeFromExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  const extToMime: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    tiff: "image/tiff",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
  };

  return extToMime[ext] || "application/octet-stream";
}

/**
 * Generate a fallback filename with proper extension
 */
export function generateFallbackFilename(
  contentType: string,
  prefix = "file",
): string {
  const ext = getExtensionFromMimeType(contentType);
  const timestamp = Date.now();
  return `${prefix}-${timestamp}.${ext}`;
}
