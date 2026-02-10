/**
 * DEV-only layout regression check for ChatRoom
 * Validates that scroll container and input composer have expected layout properties
 */

interface LayoutCheckResult {
  scrollContainerValid: boolean;
  composerVisible: boolean;
  issues: string[];
}

export function checkChatRoomLayout(
  scrollViewportRef: HTMLDivElement | null,
  inputContainerRef: HTMLDivElement | null
): LayoutCheckResult {
  const result: LayoutCheckResult = {
    scrollContainerValid: false,
    composerVisible: false,
    issues: [],
  };

  // Only run in development
  if (process.env.NODE_ENV !== 'development') {
    return result;
  }

  // Check scroll container
  if (!scrollViewportRef) {
    result.issues.push('Scroll container ref is null');
  } else {
    const { clientHeight, scrollHeight } = scrollViewportRef;
    
    if (clientHeight === 0) {
      result.issues.push('Scroll container has zero height');
    } else {
      result.scrollContainerValid = true;
    }

    // Check if scrollable when content exceeds height
    if (scrollHeight > clientHeight && clientHeight > 0) {
      const computedStyle = window.getComputedStyle(scrollViewportRef);
      const overflowY = computedStyle.overflowY;
      
      if (overflowY !== 'auto' && overflowY !== 'scroll') {
        result.issues.push(`Scroll container overflow-y is "${overflowY}", expected "auto" or "scroll"`);
      }
    }
  }

  // Check composer/input container
  if (!inputContainerRef) {
    result.issues.push('Input container ref is null');
  } else {
    const { clientHeight } = inputContainerRef;
    
    if (clientHeight === 0) {
      result.issues.push('Input container has zero height (may be hidden)');
    } else {
      result.composerVisible = true;
    }

    // Check if composer is visible in viewport
    const rect = inputContainerRef.getBoundingClientRect();
    const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;
    
    if (!isInViewport) {
      result.issues.push('Input container is not visible in viewport');
    }
  }

  // Log issues in dev console (non-blocking)
  if (result.issues.length > 0) {
    console.warn('[ChatRoom Layout Check] Issues detected:', result.issues);
  }

  return result;
}
