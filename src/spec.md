# Specification

## Summary
**Goal:** Let users create/join chat rooms and send/receive messages as guests using only a nickname (no Internet Identity required), with clear error handling.

**Planned changes:**
- Backend: remove Internet Identity / `AccessControl "#user"` requirement for core chat operations (create room, read messages, send messages) while keeping admin-only operations restricted.
- Backend: validate guest nickname inputs (trim whitespace, require non-empty, enforce max length of 20 characters) and return clear, user-friendly errors for invalid input.
- Frontend: update room create/join and message send flows to work with an anonymous actor (guest mode) and surface backend errors as clear English messages without getting stuck loading.
- Frontend: fix messaging failure handling by relying on caught backend errors (traps) rather than sentinel return values (e.g., no `messageId === 0n` checks), and ensure message fetch/send failures remain recoverable.

**User-visible outcome:** From a fresh session without logging in, a user can enter a nickname and room code to create or join a room, then send and receive messages successfully with understandable error messages when something goes wrong.
