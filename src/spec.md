# Specification

## Summary
**Goal:** Stop duplicate message sends and make message deletion reliable by normalizing room IDs, adding idempotent send behavior, and improving delete handling and diagnostics.

**Planned changes:**
- Normalize (trim) `roomId` consistently across the chat UI and all React Query hooks/mutations so fetch/send/edit/react/delete share the same backend room key and cache keys.
- Make sending idempotent: generate a client nonce per message send and update the backend to deduplicate repeated sends per room/nonce, returning the originally created `messageId` on retries/double-submission.
- Improve delete reliability and feedback: prevent deletes for optimistic/temporary message IDs, show a clear English ownership error when delete returns `false`, and refetch/ invalidate messages after any delete attempt to resync UI.
- Add targeted console-only diagnostics for send/delete failures or unexpected results (operation name, normalized roomId, nonce/messageId, optimistic flag, backend result, and IC reject details when available) without logging message content.

**User-visible outcome:** Messages send only once (even on retries or quick double-submits), deleting messages works reliably within the correct room, and the UI shows clear English feedback for ownership-related delete failures while staying in sync with the backend.
