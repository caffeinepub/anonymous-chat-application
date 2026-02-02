# Anonymous Chat Application

## Overview
A web-based anonymous chat application that allows users to create and join temporary chat rooms using secret join codes. The application emphasizes privacy and security with automatic message deletion after 24 hours. Users can set display nicknames within each room while maintaining overall anonymity. The messaging system is optimized for maximum speed with optimistic UI updates and enhanced caching.

## Core Features

### Chat Room Management
- Users can create new chat rooms that generate unique join codes
- Users can join existing chat rooms using join codes shared by friends
- Support for multiple users joining the same room from different devices and networks
- No user registration or authentication required - fully anonymous

### Nickname System
- Users can set a display nickname when joining a chat room
- Nicknames are stored locally in browser state to maintain anonymity across sessions
- Users can change their nickname at any time within the chat interface
- Nickname changes update immediately in the chat view for all participants
- Nicknames are room-specific and help distinguish participants within the same room

### Real-Time Messaging with Optimistic Updates
- Send and receive text messages in real-time with nickname display
- **Multi-line message support** - pressing Shift + Enter inserts a newline within the message, while pressing Enter alone sends the message immediately
- **Multi-line formatting preservation** - messages display exactly as typed with proper line breaks and formatting maintained
- **Optimistic UI updates** - messages appear instantly in the chat interface upon sending, before backend confirmation
- Background processing of message confirmation with automatic error recovery
- Support for emojis, GIFs, custom stickers, uploaded images, and recorded audio in messages
- Edit previously sent messages with "(edited)" badge display
- Delete sent messages with confirmation prompt and instant UI updates
- Reply to specific messages with reply preview and linkage display
- All messaging happens instantly across all connected devices with optimistic rendering
- Messages display the sender's nickname beside each message bubble
- Messages appear instantly upon sending without requiring manual reload or backend confirmation
- Automatic scroll to newest messages with manual upward scrolling capability
- Enhanced React Query caching for reduced network latency and improved performance
- Automatic retry logic for failed message sends with user feedback

### Message Reaction System
- Users can react to any message in the chat with emoji reactions (❤️ 😂 👍 😮)
- Each user can toggle their reaction on or off for any message
- Real-time reaction counts display below messages showing total reactions per emoji
- Reactions update instantly across all users in the same room with optimistic updates
- Hover or tap interactions reveal which users reacted with specific emojis
- Reaction data persists with the same 24-hour TTL as messages
- Users can add multiple different reactions to the same message
- Reaction interface appears on message hover or tap for easy access
- Reactions synchronize properly between backend and frontend with immediate visual updates
- Reaction counts display accurately without stale or lost updates

### Message Deletion
- Users can delete their own previously sent messages
- Delete icon appears only on messages sent by the current user
- Confirmation prompt displays "Delete this message?" before deletion
- Messages are removed instantly from the UI with optimistic updates
- Deleted messages are removed from backend storage via deleteMessage API
- Toast notification or subtle animation confirms successful deletion
- Delete functionality works for all message types: text, emojis, GIFs, custom stickers, uploaded images, and recorded audio
- Deleted media files are also removed from blob storage

### Audio Recording
- Users can record audio messages directly in the chat interface using microphone access
- Recording interface integrated into the media picker with microphone permission requests
- User feedback when microphone permission is denied or blocked with "Microphone access required" message and retry option
- Browser microphone permission prompts display correctly on both desktop and mobile devices
- Audio recording preview functionality allows users to review recordings before sending
- Recording controls include start/stop recording, preview playback, and send/cancel options
- Support for standard audio formats (WebM, MP4, OGG) with proper browser compatibility checks
- Recorded audio files are stored using Caffeine blob storage and referenced by URL in messages
- Audio recordings respect the 24-hour message TTL and are automatically deleted after expiry
- Recording duration limits to prevent excessive file sizes and storage usage
- Proper error handling for unsupported devices or denied microphone permissions with user-friendly feedback

### Audio Playback
- Inline audio playback controls within chat messages including play/pause button and duration progress bar
- Audio messages display waveform visualization or duration indicator
- Playback controls are responsive and work across desktop and mobile devices
- Audio files load efficiently with proper buffering and error handling

### Image Upload and Sharing
- Users can upload image files directly from their device (JPEG, PNG, GIF, WEBP formats)
- Users can paste images from their clipboard directly into the chat input field
- Clipboard image paste functionality with visual preview before sending
- Pasted images can be canceled before sending and follow the same upload pipeline as file-based uploads
- Images are stored using Caffeine blob storage and referenced by URL in messages
- Uploaded images display as inline thumbnail previews within chat messages
- Images respect the 24-hour message TTL and are automatically deleted after expiry
- Image upload button integrated into the message input bar alongside emoji and media pickers
- Seamless image sending, viewing, and synchronization across all connected devices
- Clipboard paste functionality works across desktop and mobile devices

### Clipboard Image Paste
- Paste event handling in the chat input field to detect clipboard image data
- Automatic conversion of pasted image data into Blob format
- Visual preview of pasted images before sending with cancel option
- Integration with existing image upload pipeline for consistent handling
- Support for all standard clipboard image formats
- Cross-platform compatibility for desktop and mobile devices

### Message Reply System
- Each message displays a small "Reply" icon/button for interaction
- When replying, the input bar shows a compact preview of the original message (nickname and first 50 characters)
- Reply relationships appear beneath new messages showing "Replying to [nickname]: [short snippet]"
- Replies support all message types: text, emojis, GIFs, custom stickers, uploaded images, and recorded audio
- Reply linkage is maintained and displayed in the chat interface

### Message Editing
- Users can edit their own previously sent messages
- "Edit" icon appears on messages sent by the current user
- Inline editing functionality using the chat input bar with confirmation UI
- Edited messages display an "(edited)" badge next to the content
- Edit functionality maintains message reply relationships

### Media Integration
- Integrated Tenor API for searching and sending GIFs
- Custom sticker system allowing users to upload their own sticker images
- Audio recording capabilities with microphone access
- Multi-tab media picker interface: GIFs, My Stickers, and Audio Recording
- GIF search functionality for finding specific animated content
- Trending GIF content display
- Custom sticker upload functionality with thumbnail display
- Audio recording interface with microphone permission handling and preview controls
- Inline display of animated GIFs, custom stickers, and audio players in chat messages
- Responsive media sizing within message bubbles
- Emoji picker integration for text input
- Automatic detection and rendering of GIF URLs as animated inline images within message bubbles with proper autoplay and looping behavior
- GIF links from Tenor or other sources display as embedded animated images rather than text URLs
- Proper animated GIF rendering that works seamlessly with custom stickers, emojis, uploaded images, and recorded audio across all devices
- Responsive media loading and display within chat message containers
- MessageBubble component automatically detects media URLs and renders appropriate players or viewers
- Audio files embedded with proper playback controls and responsive sizing

### Custom Sticker System
- Users can upload their own sticker images to create a personal sticker collection
- Sticker upload functionality integrated into the media picker interface
- "My Stickers" tab displays thumbnails of uploaded stickers with an upload button for adding new ones
- Uploaded stickers are stored as reusable blobs per user session
- Sticker selection sends the sticker as a regular message with image content
- Custom stickers follow the same 24-hour persistence rule as other media
- Stickers are automatically cleaned up from blob storage when they expire
- Support for standard image formats (JPEG, PNG, GIF, WEBP) for sticker uploads
- Thumbnail generation and display for efficient sticker browsing

### Message Persistence
- Chat messages are automatically stored for exactly 24 hours after being sent
- Messages are automatically deleted from storage after the 24-hour period expires
- Uploaded images, custom stickers, and recorded audio are deleted from blob storage when their associated messages expire
- Pasted clipboard images follow the same 24-hour lifespan as other message media
- No permanent message history is maintained
- Tenor media URLs cached appropriately with 24-hour expiration handling
- Custom sticker blobs and recorded media files follow the same 24-hour expiration as regular images
- Reply relationships and edit history maintained within the 24-hour window
- Message reactions follow the same 24-hour TTL as their associated messages

### User Interface
- Modern, sleek design focused on privacy and security
- Clean and intuitive chat interface with integrated media picker, image upload, and audio recording
- **Multi-line text input** - chat input field supports multi-line text entry with Shift + Enter for newlines and Enter for sending
- **Multi-line message display** - message bubbles preserve and display multi-line formatting exactly as typed
- Nickname input field for setting/changing display name
- Visual indicators for anonymous communication
- Responsive design for multiple device types
- Scrollable grid view for media selection
- Inline media display in messages with proper rendering for images, GIFs, and audio players
- Message bubbles that automatically detect and embed media URLs with appropriate players and controls
- Seamless media playback and interaction within the chat interface
- Reply, edit, and delete action buttons on message bubbles for sender's own messages
- Delete confirmation dialog with "Delete this message?" prompt
- Toast notifications or subtle animations for successful message deletion
- Reply preview display in input bar during reply composition
- Media picker with tabs for GIFs, My Stickers, and Audio Recording
- Recording interface with start/stop controls, preview functionality, and send/cancel options
- Audio permission request handling with user-friendly prompts
- Clipboard paste image preview with cancel functionality
- Chat room interface without top informational card area - no room code display, nickname display, or share instructions section
- Full-height chat layout with message area and typing bar utilizing the complete available vertical space
- Scrollable message area that occupies maximum available space above the fixed input bar using proper flexbox layout with overflow handling
- Smooth upward and downward scrolling within the message container independent of the typing bar position
- Comprehensive mobile viewport handling with safe-area-inset support for iOS and Android, ensuring the typing bar remains accessible and never disappears when the keyboard opens
- Proper keyboard compatibility that adjusts the chat container height dynamically while maintaining the fixed input bar position
- CSS viewport height calculations that account for mobile browser UI changes and keyboard interactions
- Message bubbles display sender nicknames for participant identification
- Welcome screen with proper vertical scrolling functionality on all devices, ensuring forms, feature cards, and hero content remain accessible on smaller screens without content being cut off
- Welcome screen displays correct message retention period of 24 hours instead of any incorrect references to 2 hours
- Robust error handling UI for failed message sends with user feedback and retry options
- Real-time message updates via optimized polling with enhanced React Query caching
- Custom sticker thumbnail grid display in "My Stickers" tab
- Sticker upload interface with file selection and preview functionality
- Audio recording interface with microphone access, recording controls, and preview playback
- Footer and informational text displays message retention period dynamically based on backend TTL configuration (24 hours)
- Message retention period text automatically synchronizes with backend messageTTL setting to ensure consistency
- Reaction interface with emoji selection buttons appearing on message hover or tap
- Real-time reaction count display below messages with emoji and count indicators
- Hover or tap tooltips showing which users reacted with specific emojis
- Smooth reaction animations and visual feedback for user interactions
- Immediate visual updates for reaction additions and removals without delays or stale data
- **Optimistic UI rendering** for all message operations with background confirmation processing
- **Enhanced error recovery UI** with automatic retry mechanisms and user-friendly feedback
- **Performance indicators** showing message send status and connection quality

## Backend Requirements

### Critical Bug Fixes and Stability
- **Complete backend code review** to identify and fix all runtime traps, errors, and data persistence issues
- **Message storage reliability** - ensure all message types (text, images, GIFs, audio, reactions, replies) are stored correctly without data loss
- **Map operation fixes** - verify all Map.put and Map.get operations persist data correctly with proper state mutation
- **API endpoint stability** - ensure all endpoints (sendMessage, getMessages, createRoom, joinRoom, deleteMessage, editMessage, addReaction, removeReaction) function reliably
- **Canister deployment verification** - ensure canister remains running and accessible for all API calls
- **Error handling implementation** - comprehensive error handling to prevent runtime traps and provide clear error messages
- **Data structure validation** - verify message data structures support all required fields without corruption
- **Reaction system fixes** - resolve all bugs in reaction storage, retrieval, and counting mechanisms
- **Media handling reliability** - ensure blob storage operations for images, audio, and stickers work correctly
- **Message ID generation** - implement proper unique message ID generation using timestamps or random identifiers

### Data Storage
- Store chat rooms with their associated join codes using Map data structure
- Store chat messages with unique IDs generated using timestamps or random identifiers, timestamps for automatic deletion, nickname field, optional reply reference, optional image URL, and optional audio URL using Map data structure
- **Multi-line message content** - store message text content with preserved newline characters and formatting
- Store message reactions with message ID references, user identifiers, and emoji types using proper data structures
- Store custom sticker blobs per user session with URL references and expiration timestamps
- Store recorded audio files using Caffeine blob storage with URL references and expiration timestamps
- Track message metadata for editing, deletion, and reply functionality
- Store uploaded images, custom stickers, and recorded audio using Caffeine blob storage with URL references
- Expose messageTTL configuration value (24 hours in nanoseconds) for frontend synchronization

### Optimized Message Processing
- **Asynchronous message handling** - process sendMessage requests with minimal blocking operations
- **Background map updates** - offload synchronous Map operations to reduce response latency
- **Optimized data structures** - use efficient storage mechanisms for fast message insertion and retrieval
- **Batch processing capabilities** - handle multiple message operations efficiently
- **Non-blocking I/O operations** - minimize delays in message processing pipeline
- **Enhanced error recovery** - robust fallback mechanisms for failed operations
- **Automatic retry logic** - built-in retry mechanisms for temporary failures
- **Performance monitoring** - track message processing times and optimize bottlenecks

### Audio Storage
- Store recorded audio files as blobs with unique identifiers and URL references
- Support standard audio formats (WebM, MP4, OGG)
- Generate and return media URLs for frontend playback
- Implement audio cleanup based on 24-hour expiration rule
- Handle audio upload validation for supported formats
- Provide audio retrieval functionality for message display
- Track audio file metadata including duration and file size

### Reaction System
- Store reactions per message with user identification and emoji type using reliable data structures
- Support multiple reactions per user on the same message
- Allow users to toggle reactions on and off with proper state management
- Track reaction counts per emoji per message with accurate counting
- Provide real-time reaction updates across all room participants
- Clean up reactions when their associated messages expire after 24 hours
- Handle reaction data structure with messageId, userId, and emoji fields
- Implement addReaction and removeReaction API endpoints with proper error handling
- Return reaction data with message retrieval for display synchronization
- Ensure reaction operations are atomic and prevent race conditions
- Validate reaction data integrity and prevent duplicate or invalid reactions
- Implement proper reaction state synchronization between backend storage and frontend display

### Custom Sticker Management
- Store uploaded sticker images as reusable blobs with unique identifiers
- Track sticker ownership per user session for access control
- Generate and return sticker URLs for frontend thumbnail display
- Implement sticker cleanup based on 24-hour expiration rule
- Handle sticker upload validation for supported image formats
- Provide sticker retrieval functionality for "My Stickers" display

### Message Data Structure
- Extend Message type to include optional replyToId field referencing original message ID
- Add optional imageUrl field for uploaded image and custom sticker references
- Add optional audioUrl field for recorded audio message references
- **Multi-line content field** - ensure message content field properly stores and retrieves multi-line text with preserved newline characters
- Include reactions array or map for storing reaction data per message with proper indexing
- Support message editing with edit timestamp tracking
- Maintain reply linkage relationships between messages
- Handle custom sticker messages as regular image messages with sticker URLs
- Handle audio messages as regular messages with audio URLs
- Ensure message data structure supports all required fields without data loss

### Core Operations
- Create new chat rooms and generate unique join codes with proper insertion into chatRooms map
- Validate and process room joins using join codes with error handling for non-existent rooms
- Handle real-time message broadcasting to all room participants with optimized performance
- Process message editing and deletion requests with proper validation
- Process message replies with replyToId parameter support
- Handle message reactions with addReaction and removeReaction operations with proper validation
- Handle image upload to blob storage and return URL for message inclusion
- Handle audio upload to blob storage and return URL for message inclusion
- Handle custom sticker upload to blob storage and return URL for sticker collection
- **Multi-line message processing** - properly handle and store message content containing newline characters without corruption or loss
- Implement automatic cleanup of messages older than 24 hours during message retrieval (filter expired messages before display, not during sendMessage)
- Clean up associated blob storage images, stickers, and audio files when messages expire
- Generate unique message IDs for each message using timestamps or random identifiers instead of duplicating content as ID
- Store and broadcast nickname information with each message
- Comprehensive error handling to prevent runtime traps when rooms or messages don't exist
- Provide sticker retrieval API for displaying user's custom sticker collection
- Provide API endpoint to retrieve messageTTL configuration for frontend display synchronization
- Broadcast reaction updates to all room participants in real-time with proper synchronization
- Fix any bugs in reaction storage, retrieval, and counting mechanisms
- Ensure reaction operations complete successfully without data corruption or loss
- **Enhanced asynchronous processing** for all message operations to minimize response times
- **Optimized error recovery** with automatic retry mechanisms and graceful degradation

### Message Handling
- Implement robust state mutation operations for message storage using proper Map.put operations with correct key-value persistence
- **Asynchronous sendMessage processing** - minimize blocking operations and optimize for speed
- **Background confirmation processing** - handle message persistence asynchronously while providing immediate response
- **Enhanced React Query integration** - optimize backend responses for improved frontend caching
- Ensure sendMessage function correctly retrieves existing message arrays from the messages Map, appends new messages using proper array concatenation or List operations, and persists the updated array back to the Map
- Fix any non-mutating List operations that fail to persist messages by replacing them with proper mutable state operations
- Verify that sendMessage writes messages to the messages Map with guaranteed persistence and proper error handling
- Add comprehensive validation for roomId existence and message data integrity before attempting message storage operations
- Implement proper error recovery and user feedback for failed message operations
- Update sendMessage to accept optional replyToId parameter for reply functionality, optional imageUrl parameter for image messages and custom stickers, and optional audioUrl parameter for audio messages
- **Multi-line message support** - ensure sendMessage properly accepts and stores message content with newline characters preserved
- Ensure getMessages correctly filters messages by 24-hour TTL while maintaining consistent retrieval of all active messages from the room
- Auto-create empty message list if none exists when sending a message to a room
- Validate and safely process all message types (text, images, emojis, GIFs, custom stickers, audio) without rejection or runtime errors
- Implement comprehensive blob validation and conversion for uploaded images, custom stickers, and audio files to prevent message send failures
- Support all message types with proper data structure handling and storage
- Include nickname field, optional replyToId field, optional imageUrl field, optional audioUrl field, and reactions data in message data structure
- Return complete message object with generated ID and reaction data after successful send for frontend confirmation
- Ensure immediate message persistence and real-time delivery across all connected clients
- Handle nickname updates and broadcast changes to all room participants
- Maintain reliable frontend-backend communication through React Query hooks and API endpoints
- Support message editing with proper validation that users can only edit their own messages
- Maintain 24-hour message persistence limit (messageTTL) for automatic cleanup with proper timestamp handling
- Implement centralized error handling to prevent runtime traps and provide clear error messages for failed operations
- Verify complete integration between frontend useQueries.ts hooks and backend endpoints for reliable message operations
- Conduct thorough testing of message send, edit, delete, reply, and reaction flows to ensure proper functionality
- Fix any synchronization issues between frontend state and backend persistence
- Proper timestamp filtering and message lifecycle management
- Handle custom sticker messages with the same reliability as regular image messages
- Handle audio messages with the same reliability as regular image messages
- Process reaction operations with proper validation and real-time broadcasting
- Fix any bugs in message storage and retrieval that cause data loss or corruption
- Ensure all message operations complete successfully without runtime errors
- **Optimized message processing pipeline** for maximum throughput and minimal latency
- **Enhanced error recovery mechanisms** with automatic retry and fallback strategies

### API Endpoint Reliability
- Ensure all backend endpoints (sendMessage, getMessages, createRoom, joinRoom, deleteMessage, editMessage, addReaction, removeReaction) are properly exposed and accessible
- **Optimized endpoint performance** - minimize response times and processing delays
- **Enhanced caching strategies** - implement efficient data caching for improved performance
- Verify canister deployment status and prevent stopped canister issues
- Implement robust error responses with proper HTTP status codes and error messages
- Add comprehensive input validation and sanitization for all API endpoints
- Ensure consistent API response formats across all endpoints
- Implement proper CORS handling for cross-origin requests
- Add endpoint health checks and status monitoring
- Verify canister ID resolution and endpoint URL construction
- Fix any API endpoint bugs that prevent proper communication with frontend
- Ensure reaction endpoints (addReaction, removeReaction) function correctly without errors
- **Asynchronous endpoint processing** to reduce blocking operations and improve responsiveness
- **Enhanced error recovery** with automatic retry mechanisms and graceful degradation

## Frontend Requirements

### Critical Bug Fixes and Stability
- **Complete frontend code review** to identify and fix all bugs causing message sending failures, media rendering issues, and reaction problems
- **Message sending reliability** - ensure all message types send instantly with proper optimistic updates and backend synchronization
- **Media rendering fixes** - verify all images, GIFs, and audio files display correctly with proper loading and playback
- **Reaction system fixes** - resolve all bugs preventing proper reaction addition, removal, and display
- **React Query optimization** - fix all hooks and API integration issues for reliable frontend-backend communication
- **Component stability** - ensure all chat components (MessageBubble, MediaPicker, AudioRecorder) function correctly
- **Error handling enhancement** - implement comprehensive error recovery with user-friendly feedback
- **Performance optimization** - identify and resolve all rendering bottlenecks and latency issues
- **Cross-device compatibility** - ensure seamless functionality across desktop and mobile devices

### Multi-line Message Input
- **Keyboard event handling** - implement Shift + Enter for newline insertion and Enter alone for message sending
- **Multi-line text area** - configure chat input field to support multi-line text entry with proper height adjustment
- **Text formatting preservation** - maintain exact formatting including line breaks when messages are sent and displayed
- **Input field behavior** - ensure proper cursor positioning and text selection behavior in multi-line mode
- **Mobile compatibility** - ensure multi-line input works correctly on mobile devices with virtual keyboards
- **Visual indicators** - provide clear visual cues for multi-line input mode and send behavior
- **Auto-resize functionality** - automatically adjust input field height based on content while maintaining maximum height limits
- **Paste handling** - ensure pasted multi-line content is properly handled and formatted

### Optimistic UI Updates
- **Instant message rendering** - display sent messages immediately in the chat interface before backend confirmation
- **Background confirmation processing** - handle backend responses asynchronously while maintaining UI responsiveness
- **Optimistic state management** - maintain local state for pending messages with proper synchronization
- **Error recovery UI** - provide clear feedback and retry options when messages fail to send
- **Rollback mechanisms** - remove failed messages from UI with appropriate user notification
- **Status indicators** - show message send status (sending, sent, failed) with visual cues
- **Automatic retry logic** - implement intelligent retry mechanisms for failed operations
- **Performance monitoring** - track message send times and optimize user experience

### Enhanced React Query Configuration
- **Optimized caching strategies** - configure React Query for maximum performance and minimal network requests
- **Intelligent cache invalidation** - implement smart cache updates to reduce redundant fetching
- **Background refetching optimization** - minimize unnecessary network calls while maintaining data freshness
- **Mutation optimization** - configure mutations for optimal performance with proper error handling
- **Stale-while-revalidate patterns** - implement efficient data fetching strategies
- **Query deduplication** - prevent duplicate network requests for the same data
- **Enhanced polling configuration** - optimize real-time updates with efficient polling intervals
- **Cache persistence** - implement appropriate cache persistence strategies for improved performance

### Audio Recording Interface
- Integrate microphone access permissions into the media picker interface
- Add "Audio Recording" tab to the existing media picker
- Implement recording controls with start/stop functionality and visual recording indicators
- Add preview functionality allowing users to review recordings before sending
- Implement send/cancel options for recorded media with confirmation dialogs
- Handle browser permission requests for microphone access with user-friendly prompts
- Support standard recording formats (WebM, MP4, OGG for audio)
- Add recording duration limits and file size validation
- Implement recording progress indicators and real-time feedback during recording
- Handle recording errors and provide appropriate user feedback

### Audio Playback
- Implement inline audio playback controls within message bubbles including play/pause button and duration progress bar
- Display audio messages with waveform visualization or duration indicator
- Ensure playback controls are responsive and work across desktop and mobile devices
- Implement proper buffering, loading states, and error handling for media playback
- Add volume controls and playback speed options for enhanced user experience
- Ensure audio files load efficiently with progressive loading and caching

### API Integration
- Ensure frontend correctly targets the active canister ID for all API calls
- Verify proper backend endpoint URL construction and targeting
- **Enhanced error handling** - implement robust error recovery with automatic retry mechanisms
- **Optimistic API calls** - implement optimistic updates with background confirmation
- Add automatic chat reinitialization on rejected requests or connection failures
- Implement proper canister status detection and recovery
- Add comprehensive error logging and user feedback for API failures
- **Enhanced React Query hooks** - optimize for performance and reliability with proper error handling
- Implement fallback mechanisms for temporary backend unavailability
- Add connection status indicators and user notifications for backend issues
- Verify proper async/await handling and promise resolution in API calls
- Fix any API integration bugs that prevent proper communication with backend
- **Performance optimization** - minimize network latency and improve response times
- **Intelligent retry strategies** - implement exponential backoff and smart retry logic

### Reaction System UI
- Add reaction interface with emoji selection buttons on message hover or tap
- Display real-time reaction counts below messages with emoji and count indicators
- Implement hover or tap tooltips showing which users reacted with specific emojis
- Add smooth reaction animations and visual feedback for user interactions
- Integrate reaction functionality with existing message bubble components
- Handle reaction toggle operations with optimistic UI updates
- Ensure reaction interface works seamlessly across desktop and mobile devices
- Display reaction data fetched from backend with proper synchronization
- Implement real-time reaction updates via polling or WebSocket connections
- Fix any bugs in reaction UI that prevent proper display or interaction
- Ensure immediate visual updates for reaction additions and removals
- Optimize reaction state synchronization to avoid stale or lost updates
- Ensure reaction counts display accurately without delays or incorrect values

### Error Recovery
- **Enhanced automatic reconnection logic** when backend becomes unavailable
- **Intelligent retry mechanisms** with exponential backoff and smart retry strategies
- Add user-friendly error messages for different types of connection failures
- **Optimistic error handling** - maintain UI responsiveness during error recovery
- Add manual refresh/retry buttons for persistent connection issues
- Ensure graceful degradation when backend services are temporarily unavailable
- Implement proper loading states during error recovery attempts
- Add toast notifications for successful reconnection after failures
- **Performance-aware error recovery** - minimize impact on user experience during recovery
- **Smart fallback mechanisms** - provide alternative functionality when primary features are unavailable

### Message Retention Display
- Fetch messageTTL configuration from backend API to determine current retention period
- Display message retention period dynamically in footer and informational text based on backend configuration
- Convert nanosecond TTL values to human-readable format (24 hours) for user display
- Ensure retention period text updates automatically when backend TTL configuration changes
- Update all UI text references to message retention from hardcoded values to dynamic backend-synchronized values
- Correct any existing text in WelcomeScreen.tsx that incorrectly states "2 hours" to properly display "24 hours" for message retention

## Technical Considerations
- **Complete application testing** - comprehensive testing of all features to ensure stable functionality
- **Performance optimization** - identify and resolve all bottlenecks affecting message sending and media rendering
- **Cross-platform compatibility** - ensure seamless operation across all devices and browsers
- **Error handling enhancement** - implement robust error recovery mechanisms throughout the application
- **Code quality assurance** - review and fix all code issues affecting reliability and performance
- **Deployment verification** - ensure the application is properly deployed and accessible for sharing
- **User experience optimization** - ensure instant message sending with proper visual feedback
- **Media handling reliability** - guarantee all media types display and function correctly
- **Real-time synchronization** - ensure proper message and reaction synchronization across all users
- **Application stability** - eliminate all runtime errors and ensure consistent functionality
- **Multi-line message compatibility** - ensure all existing features work seamlessly with multi-line message support
- Application content language: English
