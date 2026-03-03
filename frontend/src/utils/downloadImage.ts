/**
 * Downloads an image from a URL by triggering a browser download.
 * Uses anchor download attribute with fetch fallback for CORS-protected images.
 * 
 * NOTE: This utility is deprecated in favor of downloadImageAsPNG from downloadMedia.ts
 * which ensures all images are downloaded as PNG format.
 */
export async function downloadImage(url: string, filename?: string): Promise<void> {
  try {
    // Extract filename from URL if not provided, default to PNG
    const defaultFilename = filename || url.split('/').pop()?.split('?')[0] || 'image.png';
    
    // Ensure PNG extension
    const pngFilename = defaultFilename.endsWith('.png') 
      ? defaultFilename 
      : defaultFilename.replace(/\.[^.]+$/, '.png');
    
    // Try direct anchor download first (works for same-origin and CORS-enabled images)
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = pngFilename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    
    // Note: For cross-origin images without CORS headers, the browser will
    // open the image in a new tab instead of downloading. This is a browser
    // security limitation and the best we can do without a server proxy.
  } catch (error) {
    console.error('Error downloading image:', error);
    // Fallback: open in new tab
    window.open(url, '_blank');
  }
}

/**
 * Downloads an image from a Blob/ExternalBlob by converting to object URL.
 * 
 * NOTE: This utility is deprecated in favor of downloadImageAsPNG from downloadMedia.ts
 * which ensures all images are downloaded as PNG format.
 */
export async function downloadImageFromBlob(
  blob: Blob | Uint8Array,
  filename: string = 'image.png'
): Promise<void> {
  try {
    let blobObj: Blob;
    
    if (blob instanceof Uint8Array) {
      // Create a new Uint8Array to ensure proper type compatibility
      const uint8Array = new Uint8Array(blob);
      blobObj = new Blob([uint8Array], { type: 'image/png' });
    } else {
      blobObj = blob;
    }
    
    // Ensure PNG extension
    const pngFilename = filename.endsWith('.png') 
      ? filename 
      : filename.replace(/\.[^.]+$/, '.png');
    
    const url = URL.createObjectURL(blobObj);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = pngFilename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    
    // Clean up the object URL after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error('Error downloading image from blob:', error);
    throw error;
  }
}
