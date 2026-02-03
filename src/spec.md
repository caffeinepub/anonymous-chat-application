# Specification

## Summary
**Goal:** Let users click any reply/quotation preview to instantly jump to the original replied-to message across all message types.

**Planned changes:**
- Make the reply/quotation preview UI clickable for any message that has a `replyToId`, and on click perform an instant (non-smooth) jump to the original message in the chat list.
- Ensure each rendered message has a stable DOM anchor keyed by message id so it can be reliably targeted for jumping (and avoid breaking existing reply/edit/delete/react and media playback behaviors).
- If the original message is not currently loaded, refetch the room’s messages once and retry the jump; if still missing, show an English user notice (e.g., “Original message unavailable”) without crashing.

**User-visible outcome:** Clicking the reply preview in any reply (text, image, audio, video, etc.) immediately jumps to the original message; if the original can’t be found, the app shows a clear “Original message unavailable” notice instead of failing.
