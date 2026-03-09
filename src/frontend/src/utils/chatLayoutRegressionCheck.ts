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
  scrollContainerRef: HTMLDivElement | null,
  composerRef: HTMLDivElement | null,
): LayoutCheckResult {
  const result: LayoutCheckResult = {
    scrollContainerValid: false,
    composerVisible: false,
    issues: [],
  };

  // Only run in development
  if (process.env.NODE_ENV !== "development") {
    return result;
  }

  // Check scroll container
  if (!scrollContainerRef) {
    result.issues.push("Scroll container ref is null");
  } else {
    const { clientHeight, scrollHeight } = scrollContainerRef;

    if (clientHeight === 0) {
      result.issues.push("Scroll container has zero height");
    } else {
      result.scrollContainerValid = true;
    }

    // Check if scrollable when content exceeds height
    if (scrollHeight > clientHeight && clientHeight > 0) {
      const computedStyle = window.getComputedStyle(scrollContainerRef);
      const overflowY = computedStyle.overflowY;

      if (overflowY !== "auto" && overflowY !== "scroll") {
        result.issues.push(
          `Scroll container overflow-y is "${overflowY}", expected "auto" or "scroll"`,
        );
      }
    }
  }

  // Check composer/input container
  if (!composerRef) {
    result.issues.push("Composer ref is null");
  } else {
    const { clientHeight } = composerRef;

    if (clientHeight === 0) {
      result.issues.push("Composer has zero height (may be hidden)");
    } else {
      result.composerVisible = true;
    }

    // Check if composer is visible in viewport
    const rect = composerRef.getBoundingClientRect();
    const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

    if (!isInViewport) {
      result.issues.push("Composer is not visible in viewport");
    }

    // Check if composer is properly positioned
    const computedStyle = window.getComputedStyle(composerRef);
    const position = computedStyle.position;

    if (position !== "fixed" && position !== "sticky") {
      result.issues.push(
        `Composer position is "${position}", expected "fixed" or "sticky"`,
      );
    }
  }

  // Log issues in dev console (non-blocking)
  if (result.issues.length > 0) {
    console.warn("[ChatRoom Layout Check] Issues detected:", result.issues);
  }

  return result;
}
