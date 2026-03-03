# Specification

## Summary
**Goal:** Remove the GIF and sticker options from the chat composer UI.

**Planned changes:**
- Remove the GIF and sticker buttons/triggers from the chat composer in `ChatRoom.tsx`
- Disable or delete the `MediaPicker` component so it is no longer rendered or accessible
- Ensure other media features (image upload, audio recording, video recording/upload) remain unaffected

**User-visible outcome:** The chat message input area no longer shows GIF or sticker selection options, while all other media attachment features continue to work normally.
