/**
 * Generate a cryptographically-random nonce for message deduplication
 * Falls back to a robust timestamp+random combination if crypto is unavailable
 */
export function generateMessageNonce(): string {
  try {
    // Try to use crypto.randomUUID if available
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    
    // Fallback: use crypto.getRandomValues for random bytes
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const array = new Uint8Array(16);
      crypto.getRandomValues(array);
      return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch (error) {
    console.warn('Crypto API unavailable, using fallback nonce generation');
  }
  
  // Final fallback: timestamp + multiple random values
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${Math.random().toString(36).substr(2, 9)}`;
}
