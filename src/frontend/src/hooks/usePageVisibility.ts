import { useState, useEffect } from 'react';

/**
 * Hook that tracks document/tab visibility state.
 * Returns true when the page is visible, false when hidden.
 */
export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    // Initialize with current visibility state
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible';
  });

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isVisible;
}
