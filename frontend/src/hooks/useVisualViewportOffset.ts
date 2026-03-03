import { useEffect, useState } from 'react';

interface VisualViewportState {
  keyboardOffset: number;
  isKeyboardOpen: boolean;
  isSupported: boolean;
}

/**
 * Hook that tracks Visual Viewport API to compute keyboard-induced bottom offset.
 * Returns 0 offset on desktop (fine pointer) to prevent floating input bars.
 * Only activates keyboard offset tracking on mobile/touch devices (coarse pointer).
 */
export function useVisualViewportOffset(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>({
    keyboardOffset: 0,
    isKeyboardOpen: false,
    isSupported: typeof window !== 'undefined' && !!window.visualViewport,
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    // Check if device has a coarse pointer (mobile/touch device)
    const isMobileDevice = window.matchMedia('(pointer: coarse)').matches;
    
    // If desktop (fine pointer), don't apply keyboard offset
    if (!isMobileDevice) {
      setState({
        keyboardOffset: 0,
        isKeyboardOpen: false,
        isSupported: true,
      });
      return;
    }

    const viewport = window.visualViewport;
    let rafId: number | null = null;

    const updateOffset = () => {
      if (!viewport) return;

      // Calculate keyboard offset: difference between window height and viewport height
      const windowHeight = window.innerHeight;
      const viewportHeight = viewport.height;
      const offset = Math.max(0, windowHeight - viewportHeight);

      setState({
        keyboardOffset: offset,
        isKeyboardOpen: offset > 50, // Consider keyboard open if offset > 50px
        isSupported: true,
      });
    };

    const handleViewportChange = () => {
      // Use RAF to debounce rapid viewport events
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(updateOffset);
    };

    // Initial update
    updateOffset();

    // Listen to viewport changes
    viewport.addEventListener('resize', handleViewportChange);
    viewport.addEventListener('scroll', handleViewportChange);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      viewport.removeEventListener('resize', handleViewportChange);
      viewport.removeEventListener('scroll', handleViewportChange);
    };
  }, []);

  return state;
}
