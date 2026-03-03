/**
 * Toast deduplication utility to prevent multiple toasts for the same error
 */

import { toast } from 'sonner';

interface ToastRecord {
  key: string;
  timestamp: number;
}

const recentToasts: ToastRecord[] = [];
const DEDUP_WINDOW_MS = 3000; // 3 seconds

/**
 * Clean up old toast records
 */
function cleanupOldToasts() {
  const now = Date.now();
  const cutoff = now - DEDUP_WINDOW_MS;
  
  // Remove toasts older than the dedup window
  while (recentToasts.length > 0 && recentToasts[0].timestamp < cutoff) {
    recentToasts.shift();
  }
}

/**
 * Check if a toast with this key was recently shown
 */
function wasRecentlyShown(key: string): boolean {
  cleanupOldToasts();
  return recentToasts.some(record => record.key === key);
}

/**
 * Record that a toast was shown
 */
function recordToast(key: string) {
  recentToasts.push({
    key,
    timestamp: Date.now(),
  });
}

/**
 * Show an error toast only if it hasn't been shown recently
 */
export function toastErrorOnce(message: string, key?: string) {
  const toastKey = key || message;
  
  if (wasRecentlyShown(toastKey)) {
    return;
  }
  
  recordToast(toastKey);
  toast.error(message);
}

/**
 * Show a success toast only if it hasn't been shown recently
 */
export function toastSuccessOnce(message: string, key?: string) {
  const toastKey = key || message;
  
  if (wasRecentlyShown(toastKey)) {
    return;
  }
  
  recordToast(toastKey);
  toast.success(message);
}

/**
 * Show an info toast only if it hasn't been shown recently
 */
export function toastInfoOnce(message: string, key?: string) {
  const toastKey = key || message;
  
  if (wasRecentlyShown(toastKey)) {
    return;
  }
  
  recordToast(toastKey);
  toast.info(message);
}
