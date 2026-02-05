# Specification

## Summary
**Goal:** Fix the regression causing message sends to fail from the ChatRoom UI, including for anonymous users, and improve diagnostics for any future send failures.

**Planned changes:**
- Identify and fix the root cause of per-send failures so `sendMessage` works reliably from ChatRoom, including when the caller is anonymous (no Internet Identity).
- Adjust backend authorization/access control so core chat send operations do not trap for anonymous callers, consistent with anonymous chat behavior.
- Enhance frontend `useSendMessage` failure logging to include IC reject details (reject code/message when available) while keeping the UI error message sanitized and stable in English via `sanitizeChatError`.

**User-visible outcome:** From a fresh anonymous browser session, users can create/join a room and successfully send text, image-only, audio-only, and video-only messages without seeing a send error; if a send does fail, the UI shows a clean English error while the console includes detailed reject diagnostics.
